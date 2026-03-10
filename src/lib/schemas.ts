import { z } from 'zod'

// Rating value: 0-5 for normal ratings, or not present (undefined)
// We use z.record() for dynamic skill IDs
export const SkillFormSchema = z.object({
  ratings: z.record(
    z.string(),
    z.number().int().min(0).max(5)
  ),
  experience: z.record(
    z.string(),
    z.number().int().min(0).max(4)
  ),
  skippedCategories: z.array(z.string()),
})

export type SkillFormValues = z.infer<typeof SkillFormSchema>
