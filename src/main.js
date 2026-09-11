import { boot } from './ui/app.js';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });
boot();
