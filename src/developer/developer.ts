import '../base.css'
import './developer.css'
import { createButton } from '../components/button'

const variants = document.querySelector('#demo-variants')
const sizes = document.querySelector('#demo-sizes')
const disabled = document.querySelector('#demo-disabled')
const click = document.querySelector('#demo-click')
const clickStatus = document.querySelector('#click-status')

if (!variants || !sizes || !disabled || !click || !clickStatus) {
  throw new Error('developer 页缺少演示容器')
}

variants.append(
  createButton({ label: '保存', variant: 'primary' }),
  createButton({ label: '取消', variant: 'secondary' }),
  createButton({ label: '更多', variant: 'ghost' }),
  createButton({ label: '删除', variant: 'danger' }),
)

sizes.append(
  createButton({ label: '小按钮', size: 'sm' }),
  createButton({ label: '中按钮', size: 'md' }),
)

disabled.append(
  createButton({ label: '不可用', variant: 'primary', disabled: true }),
  createButton({ label: '不可用', variant: 'secondary', disabled: true }),
)

let count = 0

click.append(
  createButton({
    label: '点我',
    variant: 'primary',
    onClick: () => {
      count += 1
      clickStatus.textContent = `点了 ${count} 次`
    },
  }),
)
