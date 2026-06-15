import { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Sparkles } from 'lucide-react'
import { cn } from '@/utils/cn.js'

/**
 * SkillTagEditor — chip-based skill input with autocomplete suggestions.
 *
 * Props:
 *  - value: string[]           current skills
 *  - onChange: (skills) => void
 *  - suggestions: string[]     pool of suggested skills for autocomplete
 *  - max: number               max skills allowed (default 12)
 *  - disabled: boolean
 */
export function SkillTagEditor({ value = [], onChange, suggestions = [], max = 12, disabled = false }) {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)

  const lowerValue = useMemo(() => new Set(value.map((s) => s.toLowerCase())), [value])

  const filteredSuggestions = useMemo(() => {
    const q = input.trim().toLowerCase()
    return suggestions
      .filter((s) => !lowerValue.has(s.toLowerCase()))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8)
  }, [input, suggestions, lowerValue])

  function addSkill(raw) {
    const skill = String(raw || '').trim().slice(0, 30)
    if (!skill) return
    if (lowerValue.has(skill.toLowerCase())) {
      setInput('')
      return
    }
    if (value.length >= max) return
    onChange([...value, skill])
    setInput('')
    inputRef.current?.focus()
  }

  function removeSkill(skill) {
    onChange(value.filter((s) => s !== skill))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSkill(input)
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeSkill(value[value.length - 1])
    }
  }

  const atMax = value.length >= max

  return (
    <div className="space-y-3">
      {/* Selected chips + input */}
      <div
        className={cn(
          'flex min-h-[3rem] flex-wrap items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2.5 transition-all duration-200',
          focused && 'border-brand-500 ring-2 ring-brand-500/20',
          disabled && 'opacity-60',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <AnimatePresence initial={false}>
          {value.map((skill) => (
            <motion.span
              key={skill}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500/15 px-2.5 py-1 text-sm font-medium text-brand-700"
            >
              {skill}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeSkill(skill) }}
                  className="rounded-full p-0.5 text-brand-600/70 transition-colors hover:bg-brand-500/20 hover:text-brand-800"
                  aria-label={`Remove ${skill}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </motion.span>
          ))}
        </AnimatePresence>

        {!atMax && !disabled && (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={value.length === 0 ? 'Type a skill and press Enter…' : 'Add another…'}
            className="min-w-[8rem] flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
            maxLength={30}
          />
        )}
        {atMax && (
          <span className="px-1 text-xs text-ink-400">Max {max} skills</span>
        )}
      </div>

      {/* Autocomplete suggestions dropdown */}
      <AnimatePresence>
        {focused && filteredSuggestions.length > 0 && !atMax && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="flex flex-wrap gap-2"
          >
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addSkill(s) }}
                className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/50 px-2.5 py-1 text-xs font-medium text-ink-600 transition-all hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-700"
              >
                <Plus className="h-3 w-3" /> {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Helper row */}
      <div className="flex items-center gap-1.5 text-xs text-ink-400">
        <Sparkles className="h-3 w-3" />
        <span>{value.length}/{max} skills · Press Enter to add · Backspace to remove last</span>
      </div>
    </div>
  )
}
