import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding/organization')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/onboarding/organization"!</div>
}
