import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('lucide-react', () => ({
  ShieldAlert: (props: Record<string, unknown>) => <span data-testid="icon-shield" {...props} />,
}))

import { SessionPermissionNotice } from '../SessionPermissionNotice'

describe('SessionPermissionNotice', () => {
  it('states that the block is about permission, not missing data', () => {
    render(<SessionPermissionNotice />)

    expect(screen.getByText('세션 조회 권한이 없습니다')).toBeInTheDocument()
    expect(screen.getByText(/admin·manager 계정만/)).toBeInTheDocument()
  })

  /**
   * The compact variant goes into narrow cards (dashboard widget, selector),
   * where the explanation would overflow — but the headline must survive, or
   * the surface is back to showing nothing.
   */
  it('keeps the headline and drops the explanation when compact', () => {
    render(<SessionPermissionNotice compact />)

    expect(screen.getByText('세션 조회 권한이 없습니다')).toBeInTheDocument()
    expect(screen.queryByText(/admin·manager 계정만/)).not.toBeInTheDocument()
  })

  it('exposes itself to assistive technology as a status', () => {
    render(<SessionPermissionNotice />)

    expect(screen.getByRole('status', { name: '세션 조회 권한 없음' })).toBeInTheDocument()
  })
})
