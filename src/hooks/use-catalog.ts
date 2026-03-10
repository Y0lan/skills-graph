import { useContext } from 'react'
import { CatalogContext, type CatalogContextValue } from '@/lib/catalog-context'

export function useCatalog(): CatalogContextValue {
  return useContext(CatalogContext)
}
