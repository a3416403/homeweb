import preConf from './pre'
import developmentConf from './development'
import productionConf from './production'
import sitConf from './sit'
import oemSitConf from './oem-sit'
import oemConf from './oem'

const map = {
    'development': developmentConf,
    'pre': preConf,
    'production': productionConf,
    'sit': sitConf,
    'oemsit':oemSitConf,
    'oem':oemConf,
}

export default map[process.env.NODE_ENV || 'development']