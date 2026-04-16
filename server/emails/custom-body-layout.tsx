import { SinapseLayout } from './sinapse-layout.js'

interface CustomBodyLayoutProps {
  bodyHtml: string
}

/**
 * Wraps sanitized custom HTML body (from markdown) in the SINAPSE email layout.
 * Uses dangerouslySetInnerHTML because the content is already sanitized upstream.
 */
export function CustomBodyLayout({ bodyHtml }: CustomBodyLayoutProps) {
  return (
    <SinapseLayout>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </SinapseLayout>
  )
}

export default CustomBodyLayout
