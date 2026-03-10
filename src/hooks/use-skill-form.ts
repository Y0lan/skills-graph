import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SkillFormSchema, type SkillFormValues } from '@/lib/schemas'

interface UseSkillFormOptions {
  defaultValues: SkillFormValues
}

export function useSkillForm({ defaultValues }: UseSkillFormOptions) {
  const form = useForm<SkillFormValues>({
    resolver: zodResolver(SkillFormSchema),
    defaultValues,
    mode: 'onChange',
  })

  const ratings = form.watch('ratings')
  const experience = form.watch('experience')
  const skippedCategories = form.watch('skippedCategories')

  function setRating(skillId: string, value: number) {
    form.setValue(`ratings.${skillId}`, value, { shouldDirty: true })
  }

  function setExperience(skillId: string, value: number) {
    form.setValue(`experience.${skillId}`, value, { shouldDirty: true })
  }

  function toggleSkipCategory(categoryId: string) {
    const current = form.getValues('skippedCategories')
    const index = current.indexOf(categoryId)
    if (index === -1) {
      form.setValue('skippedCategories', [...current, categoryId], { shouldDirty: true })
    } else {
      form.setValue(
        'skippedCategories',
        current.filter((id) => id !== categoryId),
        { shouldDirty: true }
      )
    }
  }

  function isSkipped(categoryId: string): boolean {
    return skippedCategories.includes(categoryId)
  }

  return {
    form,
    ratings,
    experience,
    skippedCategories,
    setRating,
    setExperience,
    toggleSkipCategory,
    isSkipped,
  }
}
