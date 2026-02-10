{{/*
Expand the name of the chart.
*/}}
{{- define "aos.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "aos.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "aos.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "aos.labels" -}}
helm.sh/chart: {{ include "aos.chart" . }}
{{ include "aos.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "aos.selectorLabels" -}}
app.kubernetes.io/name: {{ include "aos.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend selector labels
*/}}
{{- define "aos.backendSelectorLabels" -}}
{{ include "aos.selectorLabels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Dashboard selector labels
*/}}
{{- define "aos.dashboardSelectorLabels" -}}
{{ include "aos.selectorLabels" . }}
app.kubernetes.io/component: dashboard
{{- end }}

{{/*
Postgres selector labels
*/}}
{{- define "aos.postgresSelectorLabels" -}}
{{ include "aos.selectorLabels" . }}
app.kubernetes.io/component: postgres
{{- end }}

{{/*
Redis selector labels
*/}}
{{- define "aos.redisSelectorLabels" -}}
{{ include "aos.selectorLabels" . }}
app.kubernetes.io/component: redis
{{- end }}
