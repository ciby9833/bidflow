import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./demo-tests',workers:1,timeout:60000,expect:{timeout:10000},use:{baseURL:'http://127.0.0.1:5180',locale:'pt-BR',timezoneId:'Asia/Jakarta',viewport:{width:1440,height:1000},actionTimeout:15000,screenshot:'only-on-failure',trace:'retain-on-failure'},outputDir:'uat-results/demo'});
