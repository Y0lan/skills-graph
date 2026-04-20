import {
  Html,
  Head,
  Body,
  Link,
} from '@react-email/components'
import { BRAND } from '../lib/brand.js'

interface SinapseLayoutProps {
  children: React.ReactNode
}

export function SinapseLayout({ children }: SinapseLayoutProps) {
  return (
    <Html lang="fr">
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <Body style={{ margin: 0, padding: 0, background: BRAND.background }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ background: BRAND.background }}
        >
          <tr>
            <td align="center" style={{ padding: '32px 16px' }}>
              <table
                role="presentation"
                width={BRAND.emailMaxWidth}
                cellPadding={0}
                cellSpacing={0}
                style={{
                  maxWidth: `${BRAND.emailMaxWidth}px`,
                  width: '100%',
                  background: BRAND.surface,
                  borderRadius: '8px',
                }}
              >
                <tr>
                  <td
                    style={{
                      padding: '40px 32px 24px 32px',
                      fontFamily: BRAND.fontFamily,
                      color: BRAND.text,
                      fontSize: BRAND.fontSize,
                      lineHeight: BRAND.lineHeight,
                    }}
                  >
                    {children}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0 32px 32px 32px' }}>
                    <table
                      role="presentation"
                      width="100%"
                      cellPadding={0}
                      cellSpacing={0}
                    >
                      <tr>
                        <td
                          style={{
                            borderLeft: `2px solid ${BRAND.primary}`,
                            padding: '16px 0 16px 16px',
                            fontFamily: BRAND.fontFamily,
                          }}
                        >
                          <p
                            style={{
                              margin: '0 0 4px 0',
                              fontSize: '14px',
                              color: BRAND.text,
                            }}
                          >
                            <strong>{BRAND.team}</strong> &mdash; {BRAND.name}
                          </p>
                          <p
                            style={{
                              margin: '0 0 12px 0',
                              fontSize: '12px',
                              color: BRAND.muted,
                              fontStyle: 'italic',
                            }}
                          >
                            {BRAND.tagline}
                          </p>
                          <p
                            style={{
                              margin: '0 0 4px 0',
                              fontSize: '12px',
                              color: BRAND.muted,
                            }}
                          >
                            <Link
                              href={BRAND.website}
                              style={{
                                color: BRAND.primary,
                                textDecoration: 'none',
                              }}
                            >
                              {BRAND.websiteLabel}
                            </Link>{' '}
                            &middot;{' '}
                            <Link
                              href={BRAND.linkedin}
                              style={{
                                color: BRAND.primary,
                                textDecoration: 'none',
                              }}
                            >
                              {BRAND.linkedinLabel}
                            </Link>
                          </p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '11px',
                              color: BRAND.subtle,
                            }}
                          >
                            {BRAND.address}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </Body>
    </Html>
  )
}

export default SinapseLayout
