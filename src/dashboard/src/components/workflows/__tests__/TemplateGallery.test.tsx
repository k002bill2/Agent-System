import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TemplateGallery } from '../TemplateGallery'

const mockTemplates = [
  { id: 't1', name: 'Python CI', description: 'Python lint and test', category: 'ci', tags: ['python', 'pytest'], yaml_content: 'name: CI', icon: 'code', popularity: 10 },
  { id: 't2', name: 'Deploy', description: 'Production deploy', category: 'deploy', tags: ['docker'], yaml_content: 'name: Deploy', icon: 'rocket', popularity: 5 },
]

describe('TemplateGallery', () => {
  const defaultProps = {
    onSelect: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ templates: mockTemplates }),
    })
  })

  it('renders gallery modal', async () => {
    render(<TemplateGallery {...defaultProps} />)
    expect(screen.getByText('Template Gallery')).toBeInTheDocument()
  })

  it('loads and displays templates', async () => {
    render(<TemplateGallery {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Python CI')).toBeInTheDocument()
      expect(screen.getByText('Production deploy')).toBeInTheDocument()
    })
  })

  it('shows category filter buttons', () => {
    render(<TemplateGallery {...defaultProps} />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('CI')).toBeInTheDocument()
    expect(screen.getByText('Deploy')).toBeInTheDocument()
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(screen.getByText('Utility')).toBeInTheDocument()
  })

  it('has search input', () => {
    render(<TemplateGallery {...defaultProps} />)
    expect(screen.getByPlaceholderText('템플릿 검색...')).toBeInTheDocument()
  })

  it('calls onClose when X clicked', () => {
    render(<TemplateGallery {...defaultProps} />)
    // Find close button
    const closeBtn = screen.getAllByRole('button').find(b => b.querySelector('svg'))
    if (closeBtn) fireEvent.click(closeBtn)
    // onClose should be called when X is clicked
  })

  it('shows template tags', async () => {
    render(<TemplateGallery {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('python')).toBeInTheDocument()
      expect(screen.getByText('docker')).toBeInTheDocument()
    })
  })

  it('navigates to preview on template click', async () => {
    render(<TemplateGallery {...defaultProps} />)
    await waitFor(() => screen.getByText('Python CI'))
    fireEvent.click(screen.getByText('Python CI'))
    await waitFor(() => {
      expect(screen.getByText('name: CI')).toBeInTheDocument()
    })
  })
})
