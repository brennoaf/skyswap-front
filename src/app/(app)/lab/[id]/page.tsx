import { LabView } from '@/components/lab/lab-view'

export default async function LabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LabView id={id} />
}
