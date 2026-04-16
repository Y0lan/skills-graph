import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from 'next-themes'
import { Linkedin } from 'lucide-react'

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export default function Footer() {
  const { resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const logoSrc = mounted && resolvedTheme === 'dark'
    ? '/assets/logo-sinapse-horizontal-dark.svg'
    : '/assets/logo-sinapse-horizontal.svg'

  return (
    <footer className="border-t border-border/50 bg-muted/30 mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-8 py-12">
        {/* Top section — 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">

          {/* Left column — Logo, description, LinkedIn */}
          <div className="space-y-4">
            <img
              src={logoSrc}
              alt="SINAPSE"
              className="h-10 w-auto"
            />
            <p className="text-sm text-muted-foreground leading-relaxed">
              {"SINAPSE — Groupement d'Intérêt Économique pour l'innovation sociale par le numérique en Nouvelle-Calédonie."}
            </p>
            <a
              href="https://www.linkedin.com/company/sinapse-nc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-5 w-5" />
            </a>
          </div>

          {/* Middle column — Navigation */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Navigation</h3>
            <nav className="flex flex-col gap-2.5">
              {[
                { label: 'Projet', href: 'https://sinapse.nc/projet' },
                { label: 'Roadmap', href: 'https://sinapse.nc/roadmap' },
                { label: 'Recrutement', href: 'https://sinapse.nc/recrutement' },
                { label: 'Actualités', href: 'https://sinapse.nc/actualites' },
                { label: 'FAQ', href: 'https://sinapse.nc/faq' },
                { label: 'Qui sommes-nous', href: 'https://sinapse.nc/qui-sommes-nous' },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>

          {/* Right column — Membres fondateurs + Contact */}
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Nos membres fondateurs</h3>
              <ul className="flex flex-col gap-2.5">
                {['CAFAT', 'Gouvernement NC', 'FSH'].map((name) => (
                  <li key={name} className="text-sm text-muted-foreground">{name}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Contact et recrutement</h3>
              <nav className="flex flex-col gap-2.5">
                <a
                  href="https://sinapse.nc/contact"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
                >
                  Contactez-nous
                </a>
                <a
                  href="https://sinapse.nc/recrutement"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
                >
                  Postulez
                </a>
              </nav>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <Link
              to="/mentions-legales"
              className="hover:text-foreground transition-colors"
            >
              Mentions légales
            </Link>
            <Link
              to="/confidentialite"
              className="hover:text-foreground transition-colors"
            >
              Politique de confidentialité
            </Link>
          </div>
          <span>&copy; 2026 GIE SINAPSE. Tous droits réservés.</span>
        </div>
      </div>
    </footer>
  )
}
