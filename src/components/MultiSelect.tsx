import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import './MultiSelect.css'

export interface MultiSelectOption {
  value: string
  label: string
  searchText?: string
}

interface MultiSelectProps {
  label: string
  placeholder: string
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
}

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')

export function MultiSelect({ label, placeholder, options, value, onChange }: MultiSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const selected = useMemo(() => value.map(item => options.find(option => option.value === item)).filter((option): option is MultiSelectOption => Boolean(option)), [options, value])
  const filtered = useMemo(() => {
    const term = normalize(query.trim())
    if (!term) return options
    return options.filter(option => normalize(`${option.label} ${option.searchText ?? ''}`).includes(term))
  }, [options, query])

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  useEffect(() => setActiveIndex(0), [query])

  const toggle = (option: MultiSelectOption) => {
    onChange(value.includes(option.value) ? value.filter(item => item !== option.value) : [...value, option.value])
    setQuery('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
      inputRef.current?.blur()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex(current => Math.max(0, Math.min(filtered.length - 1, current + direction)))
      return
    }
    if (event.key === 'Enter' && open && filtered[activeIndex]) {
      event.preventDefault()
      toggle(filtered[activeIndex])
    }
  }

  const visibleSelected = selected.slice(0, 2)
  const hiddenCount = selected.length - visibleSelected.length

  return <div className="filter multi-select" ref={rootRef}>
    <span className="multi-label">{label}</span>
    <div className={`multi-control ${open ? 'is-open' : ''}`} onClick={() => { setOpen(true); inputRef.current?.focus() }}>
      {visibleSelected.map(option => <span className="multi-chip" key={option.value} title={option.label}>
        <span>{option.label}</span>
        <button type="button" aria-label={`Remover ${option.label}`} onClick={event => { event.stopPropagation(); onChange(value.filter(item => item !== option.value)) }}><X/></button>
      </span>)}
      {hiddenCount > 0 && <span className="multi-count">+{hiddenCount}</span>}
      <input
        ref={inputRef}
        value={query}
        onChange={event => { setQuery(event.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={selected.length ? 'Buscar...' : placeholder}
        aria-label={placeholder}
        aria-expanded={open}
        role="combobox"
      />
      {value.length > 0 && <button type="button" className="multi-clear" aria-label={`Limpar ${label}`} onClick={event => { event.stopPropagation(); onChange([]); setQuery('') }}><X/></button>}
      <ChevronDown className="multi-chevron"/>
    </div>
    {open && <div className="multi-dropdown" role="listbox" aria-multiselectable="true">
      <div className="multi-search-hint"><Search/> <span>{query ? `${filtered.length} resultado(s)` : `${options.length} opções`}</span></div>
      <div className="multi-options">
        {filtered.map((option, index) => {
          const checked = value.includes(option.value)
          return <button
            type="button"
            role="option"
            aria-selected={checked}
            className={`multi-option ${index === activeIndex ? 'is-active' : ''}`}
            key={option.value}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => toggle(option)}
          ><span className="multi-check">{checked && <Check/>}</span><span>{option.label}</span></button>
        })}
        {!filtered.length && <div className="multi-empty">Nenhuma opção encontrada.</div>}
      </div>
    </div>}
  </div>
}
