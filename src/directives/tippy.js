/*
 * v-tippy — tooltip directive, the prototype stand-in for the tippy.js
 * directive used across iaas-mfe (`v-tippy="{ content, placement }"`).
 * Renders a floating tooltip above (or beside) the element on
 * mouseenter/focus, matching the team's trigger config
 * `trigger: 'focus mouseenter'`.
 */
const TIP_ATTR = 'data-v-tippy'

function ensureEl(host) {
    let tip = document.getElementById(host[TIP_ATTR])
    if (!tip) {
        tip = document.createElement('div')
        tip.className = 'v-tippy'
        tip.setAttribute('role', 'tooltip')
        document.body.appendChild(tip)
        host[TIP_ATTR] = `vtippy-${Math.random().toString(36).slice(2)}`
        tip.id = host[TIP_ATTR]
    }
    return tip
}

function show(host) {
    const opts = host.__tippy || {}
    const content = typeof opts === 'string' ? opts : opts.content
    if (!content) return
    const tip = ensureEl(host)
    tip.textContent = content
    tip.classList.toggle('v-tippy--start', opts.placement === 'left' || opts.placement === 'left-start')
    tip.classList.add('v-tippy--visible')
    const r = host.getBoundingClientRect()
    const top = r.top - 8
    tip.style.top = `${Math.max(4, top)}px`
    tip.style.left = `${Math.round(r.left + r.width / 2)}px`
}

function hide(host) {
    const tip = host[TIP_ATTR] && document.getElementById(host[TIP_ATTR])
    if (tip) tip.classList.remove('v-tippy--visible')
}

export const tippy = {
    mounted(host, binding) {
        host.__tippy = binding.value
        host.addEventListener('mouseenter', () => show(host))
        host.addEventListener('focus', () => show(host))
        host.addEventListener('mouseleave', () => hide(host))
        host.addEventListener('blur', () => hide(host))
    },
    updated(host, binding) {
        host.__tippy = binding.value
    },
    unmounted(host) {
        const tip = host[TIP_ATTR] && document.getElementById(host[TIP_ATTR])
        if (tip) tip.remove()
    },
}
