import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react"

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  SelectPrimitive.Trigger.Props & {
    size?: "sm" | "default"
  }
>(({ className, size = "default", children, ...props }, ref) => {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-background px-3 py-1 text-sm whitespace-nowrap transition-all outline-none select-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground/50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground/60" />
        }
      />
    </SelectPrimitive.Trigger>
  )
})
SelectTrigger.displayName = "SelectTrigger"

function SelectContent({
  className,
  children,
  searchable = true,
  searchPlaceholder = "Search options...",
  emptyMessage = "No options found",
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  > & {
    searchable?: boolean
    searchPlaceholder?: string
    emptyMessage?: string
  }) {
  const [query, setQuery] = React.useState("")
  const searchRef = React.useRef<HTMLInputElement>(null)
  const normalizedQuery = normalizeSearchText(query)
  const filteredChildren = React.useMemo(
    () => normalizedQuery ? filterSelectChildren(children, normalizedQuery) : children,
    [children, normalizedQuery]
  )
  const hasResults = hasSelectItems(filteredChildren)

  React.useEffect(() => {
    if (!searchable) return
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [searchable])

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "relative isolate z-50 flex max-h-(--available-height) w-[var(--anchor-width)] min-w-48 origin-(--transform-origin) flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {searchable ? (
            <div
              className="shrink-0 border-b border-border/70 bg-popover p-1.5"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation()
              }}
            >
              <div className="flex h-8 items-center gap-2 rounded-md border border-input bg-background/80 px-2 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
                <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault()
                      const popup = searchRef.current?.closest('[data-slot="select-content"]')
                      const firstItem = popup?.querySelector<HTMLElement>('[data-slot="select-item"]:not([data-disabled])')
                      firstItem?.focus()
                    }
                    if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation()
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); searchRef.current?.focus() }}
                    className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <SelectScrollUpButton />
          <SelectPrimitive.List className="min-h-0 overflow-y-auto p-1.5 outline-none custom-scrollbar">
            {hasResults ? filteredChildren : (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground" role="status">
                {emptyMessage}
              </div>
            )}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim()
}

function selectNodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(selectNodeText).join(" ")
  if (!React.isValidElement(node)) return ""
  const props = node.props as { children?: React.ReactNode; textValue?: string; value?: string }
  return [props.textValue, props.value, selectNodeText(props.children)].filter(Boolean).join(" ")
}

function filterSelectChildren(node: React.ReactNode, query: string): React.ReactNode {
  return React.Children.map(node, child => {
    if (!React.isValidElement(child)) return child
    const props = child.props as { children?: React.ReactNode; textValue?: string; value?: string }
    if (child.type === SelectItem) {
      return normalizeSearchText(selectNodeText(child)).includes(query) ? child : null
    }
    if (props.children === undefined) return child
    const filtered = filterSelectChildren(props.children, query)
    if (child.type === SelectGroup && !hasSelectItems(filtered)) return null
    return React.cloneElement(child as React.ReactElement<any>, undefined, filtered)
  })
}

function hasSelectItems(node: React.ReactNode): boolean {
  let found = false
  React.Children.forEach(node, child => {
    if (found || !React.isValidElement(child)) return
    if (child.type === SelectItem) { found = true; return }
    found = hasSelectItems((child.props as { children?: React.ReactNode }).children)
  })
  return found
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-md py-2 pr-8 pl-2.5 text-sm outline-none select-none transition-colors focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2.5 flex size-4 items-center justify-center text-primary" />
        }
      >
        <CheckIcon className="size-3.5 stroke-[3]" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

type SearchableSelectOption = {
  value: string
  label: React.ReactNode
  searchText?: string
  disabled?: boolean
}

function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Search options...",
  emptyMessage,
  disabled,
  className,
  contentClassName,
  id,
  ariaLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
  contentClassName?: string
  id?: string
  ariaLabel?: string
}) {
  const selected = options.find(option => option.value === value)
  return (
    <Select value={value} disabled={disabled} onValueChange={next => next !== null && onValueChange(next)}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={className}>
        <SelectValue placeholder={placeholder}>{selected?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClassName} searchPlaceholder={searchPlaceholder} emptyMessage={emptyMessage}>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}{option.searchText ? <span className="sr-only"> {option.searchText}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  SearchableSelect,
}
export type { SearchableSelectOption }
