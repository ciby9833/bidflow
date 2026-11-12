import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./uat',workers:1,timeout:60000,expect:{timeout:10000},
  use:{actionTimeout:10000,baseURL:'http://127.0.0.1:5180',locale:'pt-BR',timezoneId:'Asia/Jakarta',viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},
  outputDir:'uat-results',
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5180',url:'http://127.0.0.1:5180',reuseExistingServer:true},
});
