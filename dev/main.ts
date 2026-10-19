import { mountApp } from '../src/app/bootstrap'
import { createPreviewGateway, scenarios, type Scenario } from './scenarios'
import ComponentWorkbench from './ComponentWorkbench.vue'
import { createHttpVmGateway } from '../src/modules/vm'
import { createReadClient } from '../src/shared/api/readClient'

if (!import.meta.env.DEV) throw new Error('开发预览不能用于正式构建')
const parameters = new URLSearchParams(location.search)
const requested = parameters.get('scenario')
const scenario = scenarios.includes(requested as Scenario) ? (requested as Scenario) : 'default'
const gateway =
  parameters.get('transport') === 'http'
    ? createHttpVmGateway(createReadClient(), null)
    : createPreviewGateway(scenario)
mountApp(gateway, [
  { path: '/components', component: ComponentWorkbench, meta: { title: 'components' } },
])
