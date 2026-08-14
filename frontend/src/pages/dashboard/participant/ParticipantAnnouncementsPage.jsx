import { formatDate } from '@/utils/format.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useEvent } from '@/context/EventContext.jsx'
import { useAnnouncements } from '@/hooks/useAnnouncements.js'
import { useParticipantWorkspace } from '@/hooks/useParticipantWorkspace.js'
import { SectionHeading } from '@/components/ui/SectionHeading.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { Badge } from '@/components/ui/Badge.jsx'

export function ParticipantAnnouncementsPage() {
  usePageSeo({ title: 'Announcements', description: 'Official updates for your edition.' })
  const { eventId } = useEvent()
  const { team, user } = useParticipantWorkspace()
  const isRegisteredLeader = Boolean(
    team && user && team.leaderId === user.uid &&
    (team.eventRegistered === true || team.registrationStatus === 'registered'),
  )
  const { items, loading } = useAnnouncements(80, { eventId, participantFeed: true, isRegisteredLeader })

  const pinned = items.filter((a) => a.pinned)
  const rest = items.filter((a) => !a.pinned)

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <SectionHeading
        align="left"
        eyebrow="Newsroom"
        title="Announcements"
        description="Filtered to participant-visible posts for this edition when eventId is set on a post."
      />

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {pinned.length ? (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600">Pinned</h2>
              <ul className="mt-4 space-y-4">
                {pinned.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-6 shadow-sm"
                  >
                    <Badge tone="brand" className="mb-2 text-[10px]">
                      Pinned
                    </Badge>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{formatDate(a.createdAt)}</p>
                    <h3 className="mt-2 font-display text-xl font-semibold text-ink-900">{a.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{a.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            {pinned.length ? (
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">All updates</h2>
            ) : null}
            <ul className={`space-y-4 ${pinned.length ? 'mt-4' : ''}`}>
              {rest.map((a) => (
                <li
                  key={a.id}
                  className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {formatDate(a.createdAt)}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-ink-900">{a.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{a.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {!loading && items.length === 0 ? (
        <p className="text-center text-sm text-ink-500">No announcements yet for this view.</p>
      ) : null}
    </div>
  )
}
