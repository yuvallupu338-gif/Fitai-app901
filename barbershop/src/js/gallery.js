/**
 * The wall of photographs and its lightbox.
 *
 * The lightbox is keyboard-first: arrows move between images, Escape closes,
 * Tab is trapped inside it, and focus returns to the thumbnail that opened it.
 */

import { el, render, icon, qs, trapFocus } from './ui.js'
import { PHOTO_ALT } from './photo-alt.js'

/** Order here is the order on the wall. Items 1 and 6 get the tall cells. */
const ITEMS = [
  { photo: 'cut-fade', caption: 'סקין פייד' },
  { photo: 'cut-crop', caption: 'קרופ מרקמי' },
  { photo: 'cut-classic', caption: 'קלאסי' },
  { photo: 'cut-shave', caption: 'גילוח בתער' },
  { photo: 'cut-beard', caption: 'עיצוב זקן' },
  { photo: 'cut-pompadour', caption: 'פומפדור' },
  { photo: 'cut-curls', caption: 'תלתלים ופייד' },
  { photo: 'cut-kids', caption: 'תספורת ילדים' },
]

const src = (photo) => `assets/img/${photo}.jpg`
const alt = (photo) => PHOTO_ALT[photo] ?? ''

export function mountGallery(grid) {
  const lightbox = qs('#lightbox')
  const image = qs('#lightboxImg')
  const caption = qs('#lightboxCaption')
  const counter = qs('#lightboxCount')

  let index = 0
  let releaseTrap = null

  function show(i) {
    index = (i + ITEMS.length) % ITEMS.length
    const item = ITEMS[index]
    image.src = src(item.photo)
    image.alt = alt(item.photo)
    caption.textContent = item.caption
    counter.textContent = `${index + 1} מתוך ${ITEMS.length}`
  }

  function open(i) {
    show(i)
    lightbox.hidden = false
    document.body.style.overflow = 'hidden'
    qs('#lightboxClose').focus()
    releaseTrap = trapFocus(lightbox, close)
  }

  function close() {
    lightbox.hidden = true
    document.body.style.overflow = ''
    releaseTrap?.()
    releaseTrap = null
  }

  render(
    grid,
    ITEMS.map((item, i) =>
      el(
        'button',
        {
          type: 'button',
          className: 'gallery__item',
          'aria-label': `הגדלת התמונה: ${item.caption}`,
          onclick: () => open(i),
        },
        [
          el('img', { src: src(item.photo), alt: alt(item.photo), loading: i < 2 ? 'eager' : 'lazy' }),
          el('span', { className: 'gallery__caption', textContent: item.caption }),
        ],
      ),
    ),
  )

  qs('#lightboxClose').append(icon('close', { size: 22 }))
  qs('#lightboxPrev').append(icon('arrow', { size: 22 }))
  qs('#lightboxNext').append(icon('arrow', { size: 22 }))

  qs('#lightboxClose').addEventListener('click', close)
  // In an RTL layout the "previous" arrow sits on the right, but the meaning of
  // ArrowRight also flips — both are handled below so either reading works.
  qs('#lightboxPrev').addEventListener('click', () => show(index - 1))
  qs('#lightboxNext').addEventListener('click', () => show(index + 1))
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) close()
  })

  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return
    if (e.key === 'ArrowRight') show(index - 1)
    else if (e.key === 'ArrowLeft') show(index + 1)
  })
}
