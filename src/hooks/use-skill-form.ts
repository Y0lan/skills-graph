import { useForm, useWatch } from 'react-hook-form'
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

  const ratings = useWatch({ control: form.control, name: 'ratings' })
  const experience = useWatch({ control: form.control, name: 'experience' })
  const skippedCategories = useWatch({ control: form.control, name: 'skippedCategories' })
  const declinedCategories = useWatch({ control: form.control, name: 'declinedCategories' })

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

  function setDeclinedCategories(updater: (prev: string[]) => string[]) {
    const current = form.getValues('declinedCategories')
    form.setValue('declinedCategories', updater(current), { shouldDirty: true })
  }

  return {
    form,
    ratings,
    experience,
    skippedCategories,
    declinedCategories,
    setRating,
    setExperience,
    toggleSkipCategory,
    isSkipped,
    setDeclinedCategories,
  }
}
