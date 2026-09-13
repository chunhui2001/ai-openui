import './button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export type ButtonOptions = {
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  type?: 'button' | 'submit'
  onClick?: (event: MouseEvent) => void
}

export function createButton(options: ButtonOptions): HTMLButtonElement {
  const {
    label,
    variant = 'secondary',
    size = 'md',
    disabled = false,
    type = 'button',
    onClick,
  } = options

  const button = document.createElement('button')

  button.type = type
  button.className = `ui-button ui-button--${variant} ui-button--${size}`
  button.textContent = label
  button.disabled = disabled

  if (onClick) {
    button.addEventListener('click', onClick)
  }

  return button
}
