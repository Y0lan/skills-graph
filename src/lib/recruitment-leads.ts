const RECRUITMENT_LEADS = [
  'yolan-maldonado',
  'olivier-faivre',
  'guillaume-benoit',
]

export function isRecruitmentLead(slug: string | null | undefined): boolean {
  return !!slug && RECRUITMENT_LEADS.includes(slug)
}
