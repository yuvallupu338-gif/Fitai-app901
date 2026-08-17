/**
 * Entry point for the single-file build, where the shop and the diary share one
 * document and `#admin` is the only thing that tells them apart.
 *
 * Each half mounts at most once, the first time it is asked for. Leaving the
 * diary is a hash change rather than a reload, because a reload of a file:// URL
 * is fine but a reload of a 2 MB data-heavy document is not free — and there is
 * no server to go back to.
 */

import { ROUTES } from './routes.js'
import { mountSite } from './site.js'
import { mountAdmin } from './admin.js'
import { qs } from './ui.js'

ROUTES.site = '#top'
ROUTES.admin = '#admin'

const siteParts = () => [qs('#siteHeader'), qs('#main'), qs('.site-footer'), qs('#bookFab')].filter(Boolean)
const adminRoot = qs('#adminRoot')

let siteMounted = false
let adminMounted = false

function show() {
  const wantsAdmin = location.hash === '#admin'

  document.body.classList.toggle('admin', wantsAdmin)
  adminRoot.hidden = !wantsAdmin
  for (const node of siteParts()) node.hidden = wantsAdmin

  if (wantsAdmin) {
    if (!adminMounted) {
      adminMounted = true
      mountAdmin()
    }
    document.title = 'יומן ההזמנות · רון מלכה'
  } else {
    if (!siteMounted) {
      siteMounted = true
      mountSite()
    }
    document.title = 'רון מלכה · ברברשופ — הזמנת תור'
  }
}

// The diary's "נעילה" button calls location.reload(); on a hash URL that lands
// back here with #admin still set, which is what we want — locked, not gone.
window.addEventListener('hashchange', show)
show()
