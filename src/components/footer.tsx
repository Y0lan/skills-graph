import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="font-medium text-foreground">GIE SINAPSE</span>
            <span>— Skill Radar</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/mentions-legales" className="hover:text-foreground transition-colors">
              Mentions légales
            </Link>
            <span className="text-muted-foreground/40">|</span>
            <Link to="/confidentialite" className="hover:text-foreground transition-colors">
              Politique de confidentialité
            </Link>
            <span className="text-muted-foreground/40">|</span>
            <a href="https://sinapse.nc" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              sinapse.nc
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
