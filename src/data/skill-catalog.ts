export interface LevelDescriptor {
  level: number
  label: string
  description: string
}

export interface Skill {
  id: string
  label: string
  categoryId: string
  descriptors: LevelDescriptor[]
}

export interface SkillCategory {
  id: string
  label: string
  emoji: string
  skills: Skill[]
}
