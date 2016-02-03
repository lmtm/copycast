import { Observable } from 'rx'
import { run } from '@cycle/core'
import { div, link, makeDOMDriver } from '@cycle/dom'
import storageDriver from '@cycle/storage'

import { Sidebar, Resizer, Editor } from './components'
import { hlThemes } from './hl'
import getClickIds$ from './utils/dom'
import { getContent } from './utils/tree-walker'
import createSocketIODriver from './drivers/cycle-socket.io'

import Clipboard from 'clipboard'
new Clipboard('.clipboard')

// localStorage key
const LS_HL_THEME = 'copycast.hl-theme'

const intent = ({ DOM, socket, storage }) => {
	// from server's watcher
	const tree$ = socket.get('tree')
	// to add visual indicator
	const conn$ = Observable.merge(
		socket.get('connect').map(() => true),
		socket.get('disconnect').map(() => false))

	// sidebar tree
	const selected$ = getClickIds$(DOM, 'file')
	const collapsed$ = getClickIds$(DOM, 'dirname')
		.scan((set, v) => {
			if (!v) return set
			set.has(v) ? set.delete(v) : set.add(v)
			return set
		}, new Set)

	// resizer
	const mouseMove$ = Observable.fromEvent(document, 'mousemove')
	const mouseDown$ =  DOM.select('.resizer').events('mousedown')
	const mouseUp$ =  DOM.select('#app').events('mouseup')
	const sidebarWidth$ = mouseDown$.flatMap(() =>
		mouseMove$.map(({ clientX }) => clientX).takeUntil(mouseUp$)
	).startWith(230)

	const hlTheme$ = storage.local.getItem(LS_HL_THEME)
		.map(v => v === null ? hlThemes[34] : v) // default to GitHub theme

	// to refresh elapsed counter regularly
	const elapsed$ = Observable.timer(0, 5000)

	return { tree$, selected$, collapsed$, conn$, hlTheme$, sidebarWidth$, elapsed$ }
}

const model = ({ tree$, selected$, collapsed$, conn$, hlTheme$, sidebarWidth$, elapsed$ }) =>
	Observable.combineLatest(
		tree$, selected$, collapsed$, conn$, hlTheme$, sidebarWidth$, elapsed$,
		(tree, selected, collapsed, conn, hlTheme, sidebarWidth) =>
			({ tree, selected, collapsed, conn, hlTheme, sidebarWidth, content: getContent(tree, selected) }))

const view = (state$) =>
	state$.map(({ tree, selected, collapsed, conn, hlTheme, sidebarWidth, content }) =>
		div('#app', [
			Sidebar({ tree, selected, collapsed, conn, hlTheme, sidebarWidth }),
			Resizer(),
			Editor({ selected, content }),
			link({ rel: 'stylesheet', href: `hl-themes/${hlTheme}.css` })
		]))

const main = (sources) => ({
	DOM: view(model(intent(sources))),
	// save sidebar <select> value to localStorage
	storage: sources.DOM.select('.hl-themes').events('change')
		.map(({ target }) => ({ key: LS_HL_THEME, value: target.value }))
})

// components

run(main, {
	DOM: makeDOMDriver('#root'),
	socket: createSocketIODriver(),
	storage: storageDriver
})
