// Import the real private library, never the prototype stand-ins.
import UIKit from '@panel/uikit'
import PortalVue from 'portal-vue'
import '@panel/uikit/styles.css'

export { default } from '@panel/uikit'
export {
  ArAlert, ArBadge, ArButton, ArButtonCopy, ArButtonMenu, ArCard, ArCheckbox, ArContainer, ArField, ArIcon,
  ArLineAreaChart, ArProductIcon, ArSidePanel, ArTooltip,
  ArInput, ArLinkButton, ArModal, ArProgressBar, ArRadio, ArRadioGroup, ArSection, ArSelect, ArSubHeader,
  ArTab, ArTable, ArTableCell, ArTableRow, ArTag, ArPagination,
} from '@panel/uikit'

/* product names accepted by ArProductIcon (mirrors its PRODUCT constant) */
export const PRODUCT_ICON = { CONTAINER: 'container' }

export const installUIKit = (app) => app.use(PortalVue).use(UIKit, { locale: 'en' })
