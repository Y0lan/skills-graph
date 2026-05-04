import { useEffect, type RefObject } from 'react'

/**
 * Mesure la hauteur d'un élément via ResizeObserver et la propage dans une
 * custom property CSS (`--<name>: <h>px`) sur `document.documentElement`.
 *
 * Pourquoi : les sticky headers dans `recruit-pipeline-page` ont besoin que
 * le shell filtres connaisse la hauteur actuelle du shell KPI au-dessus
 * (qui varie : breakpoint, funnel chips qui wrap, etc.). Plutôt que coder
 * `top-[14rem]` en dur, on lit `top-[var(--sticky-top-2)]` qui est calculé
 * via cette hauteur runtime + `--app-header-h`.
 *
 * Le cleanup remet la variable à `0px` pour qu'un démontage de page ne
 * laisse pas un offset fantôme sur d'autres pages utilisant la variable.
 */
export function useElementHeight(
  ref: RefObject<HTMLElement | null>,
  cssVarName: `--${string}`,
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const apply = (h: number) => {
      root.style.setProperty(cssVarName, `${Math.round(h)}px`)
    }
    apply(el.getBoundingClientRect().height)
    if (typeof ResizeObserver === 'undefined') {
      return () => root.style.setProperty(cssVarName, '0px')
    }
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      // borderBoxSize is more accurate when border-y is involved; fall back
      // to contentRect if unsupported (older Safari).
      const blk = entry.borderBoxSize?.[0]?.blockSize
      apply(blk ?? entry.contentRect.height)
    })
    obs.observe(el)
    return () => {
      obs.disconnect()
    }
  })

  useEffect(() => {
    return () => {
      document.documentElement.style.setProperty(cssVarName, '0px')
    }
  }, [cssVarName])
}
