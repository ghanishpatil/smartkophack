import { cn } from '@/utils/cn.js'

export function Marquee({
  children,
  speed = 30,
  reverse,
  pauseOnHover = false,
  className,
  innerClassName,
}) {
  const duration = `${speed}s`

  return (
    <div
      className={cn(
        'marquee-container group',
        className,
      )}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden={i === 1 ? 'true' : undefined}
          className={cn(
            'flex shrink-0 items-center gap-8',
            innerClassName,
          )}
          style={{
            animation: `${reverse ? 'marquee-reverse' : 'marquee'} ${duration} linear infinite`,
            animationPlayState: 'running',
          }}
        >
          {children}
        </div>
      ))}
    </div>
  )
}

export function MarqueeText({
  text,
  speed = 20,
  separator = '  •  ',
  repeat = 6,
  className,
  textClassName,
}) {
  const items = Array.from({ length: repeat }, () => text)

  return (
    <Marquee speed={speed} className={className}>
      {items.map((t, i) => (
        <span
          key={i}
          className={cn(
            'whitespace-nowrap text-sm font-medium text-ink-500',
            textClassName,
          )}
        >
          {t}
          {i < items.length - 1 ? separator : ''}
        </span>
      ))}
    </Marquee>
  )
}
