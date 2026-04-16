import {
  Html,
  Head,
  Body,
  Link,
} from '@react-email/components'

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
      <Body style={{ margin: 0, padding: 0, background: '#f4f4f5' }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ background: '#f4f4f5' }}
        >
          <tr>
            <td align="center" style={{ padding: '32px 16px' }}>
              <table
                role="presentation"
                width={560}
                cellPadding={0}
                cellSpacing={0}
                style={{
                  maxWidth: '560px',
                  width: '100%',
                  background: '#ffffff',
                  borderRadius: '8px',
                }}
              >
                <tr>
                  <td
                    style={{
                      padding: '40px 32px 24px 32px',
                      fontFamily:
                        "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
                      color: '#1a1a1a',
                      fontSize: '15px',
                      lineHeight: '1.7',
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
                            borderLeft: '2px solid #008272',
                            padding: '16px 0 16px 16px',
                            fontFamily:
                              "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
                          }}
                        >
                          <p
                            style={{
                              margin: '0 0 4px 0',
                              fontSize: '14px',
                              color: '#1a1a1a',
                            }}
                          >
                            <strong>Team</strong> &mdash; GIE SINAPSE
                          </p>
                          <p
                            style={{
                              margin: '0 0 12px 0',
                              fontSize: '12px',
                              color: '#666',
                              fontStyle: 'italic',
                            }}
                          >
                            Du code et du sens &middot; Transformation
                            num&eacute;rique de la protection sociale de
                            Nouvelle Cal&eacute;donie
                          </p>
                          <p
                            style={{
                              margin: '0 0 4px 0',
                              fontSize: '12px',
                              color: '#666',
                            }}
                          >
                            <Link
                              href="https://www.sinapse.nc"
                              style={{
                                color: '#008272',
                                textDecoration: 'none',
                              }}
                            >
                              www.sinapse.nc
                            </Link>{' '}
                            &middot;{' '}
                            <Link
                              href="https://www.linkedin.com/company/sinapse-nc/"
                              style={{
                                color: '#008272',
                                textDecoration: 'none',
                              }}
                            >
                              LinkedIn
                            </Link>
                          </p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '11px',
                              color: '#999',
                            }}
                          >
                            BP L5 98849 NOUMEA CEDEX,
                            Nouvelle-Cal&eacute;donie
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
