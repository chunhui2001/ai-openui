import './home.css'

const diagram = document.querySelector<HTMLElement>('.home-diagram')
const diagramImage = diagram?.querySelector<HTMLImageElement>('.diagram-full')

function markDiagramLoaded(): void {
  diagram?.classList.add('is-loaded')
  diagram?.removeAttribute('aria-busy')
}

function markDiagramError(): void {
  diagram?.classList.add('is-error')
  diagram?.removeAttribute('aria-busy')
}

if (diagram && diagramImage) {
  diagramImage.addEventListener('load', markDiagramLoaded, { once: true })
  diagramImage.addEventListener('error', markDiagramError, { once: true })

  if (diagramImage.complete && diagramImage.naturalWidth > 0) {
    markDiagramLoaded()
  } else if (diagramImage.complete) {
    markDiagramError()
  }
}
