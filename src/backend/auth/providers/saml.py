"""SAML 2.0 authentication provider."""

import base64
import uuid
import zlib
from datetime import datetime

from utils.time import utcnow
from urllib.parse import urlencode
from xml.etree import ElementTree as ET

from auth.providers.base import AuthProvider, UserInfo
from config import get_settings


class SAMLConfig:
    """SAML configuration."""

    def __init__(
        self,
        sp_entity_id: str,
        sp_acs_url: str,
        idp_entity_id: str | None = None,
        idp_sso_url: str | None = None,
        idp_slo_url: str | None = None,
        idp_certificate: str | None = None,
        sp_private_key: str | None = None,
        sp_certificate: str | None = None,
        name_id_format: str = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    ):
        self.sp_entity_id = sp_entity_id
        self.sp_acs_url = sp_acs_url
        self.idp_entity_id = idp_entity_id
        self.idp_sso_url = idp_sso_url
        self.idp_slo_url = idp_slo_url
        self.idp_certificate = idp_certificate
        self.sp_private_key = sp_private_key
        self.sp_certificate = sp_certificate
        self.name_id_format = name_id_format


class SAMLAuthProvider(AuthProvider):
    """
    SAML 2.0 authentication provider.

    Note: For production use, consider using python3-saml library for full
    SAML support including signature validation.
    """

    NAMESPACES = {
        "saml": "urn:oasis:names:tc:SAML:2.0:assertion",
        "samlp": "urn:oasis:names:tc:SAML:2.0:protocol",
    }

    def __init__(self, config: SAMLConfig | None = None):
        self.settings = get_settings()
        self.config = config or self._load_config()
        self._pending_requests: dict[str, dict] = {}  # request_id -> request data

    def _load_config(self) -> SAMLConfig:
        """Load SAML configuration from settings."""
        return SAMLConfig(
            sp_entity_id=self.settings.saml_sp_entity_id
            or f"{self.settings.frontend_url}/saml/metadata",
            sp_acs_url=self.settings.saml_sp_acs_url
            or f"{self.settings.frontend_url}/api/auth/saml/acs",
        )

    @property
    def provider_name(self) -> str:
        return "saml"

    async def get_auth_url(self, redirect_uri: str, state: str) -> str:
        """
        Generate SAML authentication request URL.

        Creates an AuthnRequest and returns the IdP SSO URL with the request.
        """
        if not self.config.idp_sso_url:
            raise ValueError("SAML IdP SSO URL not configured")

        request_id = f"_aos_{uuid.uuid4().hex}"

        # Create AuthnRequest
        authn_request = self._create_authn_request(request_id)

        # Store request for validation
        self._pending_requests[request_id] = {
            "redirect_uri": redirect_uri,
            "state": state,
            "created_at": utcnow().isoformat(),
        }

        # Encode and compress
        compressed = zlib.compress(authn_request.encode())[2:-4]  # Remove zlib header/footer
        encoded = base64.b64encode(compressed).decode()

        # Build redirect URL
        params = {
            "SAMLRequest": encoded,
            "RelayState": state,
        }

        return f"{self.config.idp_sso_url}?{urlencode(params)}"

    async def exchange_code(self, code: str, redirect_uri: str) -> UserInfo:
        """
        Process SAML response (code is the SAMLResponse).

        Note: In real implementation, you would:
        1. Base64 decode the response
        2. Validate the signature against IdP certificate
        3. Check assertions and conditions
        """
        try:
            # Decode SAML response
            decoded = base64.b64decode(code)

            # Parse XML
            root = ET.fromstring(decoded)

            # Extract user info from assertion
            assertion = root.find(".//saml:Assertion", self.NAMESPACES)
            if assertion is None:
                raise ValueError("No assertion found in SAML response")

            # Get NameID (usually email)
            name_id = assertion.find(".//saml:NameID", self.NAMESPACES)
            email = name_id.text if name_id is not None else None

            if not email:
                raise ValueError("No email found in SAML assertion")

            # Get attributes
            attributes = {}
            attr_statement = assertion.find(".//saml:AttributeStatement", self.NAMESPACES)
            if attr_statement is not None:
                for attr in attr_statement.findall("saml:Attribute", self.NAMESPACES):
                    name = attr.get("Name")
                    value_elem = attr.find("saml:AttributeValue", self.NAMESPACES)
                    if name and value_elem is not None:
                        attributes[name] = value_elem.text

            # Extract common attributes
            name = attributes.get("displayName") or attributes.get("cn") or attributes.get("name")
            user_id = attributes.get("uid") or attributes.get("userPrincipalName") or email

            return UserInfo(
                id=user_id,
                email=email,
                name=name,
                provider="saml",
                raw_attributes=attributes,
            )

        except ET.ParseError as e:
            raise ValueError(f"Invalid SAML response: {e}")

    def _create_authn_request(self, request_id: str) -> str:
        """Create SAML AuthnRequest XML."""
        issue_instant = utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        return f"""<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="{request_id}"
    Version="2.0"
    IssueInstant="{issue_instant}"
    AssertionConsumerServiceURL="{self.config.sp_acs_url}"
    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
    <saml:Issuer>{self.config.sp_entity_id}</saml:Issuer>
    <samlp:NameIDPolicy
        Format="{self.config.name_id_format}"
        AllowCreate="true"/>
</samlp:AuthnRequest>"""

    def generate_sp_metadata(self) -> str:
        """Generate SAML Service Provider metadata XML."""
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor
    xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
    entityID="{self.config.sp_entity_id}">
    <md:SPSSODescriptor
        AuthnRequestsSigned="false"
        WantAssertionsSigned="true"
        protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:NameIDFormat>{self.config.name_id_format}</md:NameIDFormat>
        <md:AssertionConsumerService
            Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
            Location="{self.config.sp_acs_url}"
            index="0"
            isDefault="true"/>
    </md:SPSSODescriptor>
</md:EntityDescriptor>"""

    async def logout(self, session_id: str) -> str | None:
        """Generate SAML logout request URL if SLO is configured."""
        if not self.config.idp_slo_url:
            return None

        # Would generate LogoutRequest here
        return self.config.idp_slo_url
