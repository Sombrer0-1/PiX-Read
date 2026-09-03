/**
 * Vue Application Entry Point
 */

import { createApp } from "vue";
import { createPinia } from "pinia";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import App from "./App.vue";
import router from "./router";
import "./assets/styles/main.css";
import "./types/ipc"; // Register global type declarations

const vuetify = createVuetify({
  components: { ...vuetifyComponents },
  directives: { ...vuetifyDirectives },
  defaults: {
    global: {
      ripple: false,
    },
    VTextField: {
      variant: "outlined",
      density: "comfortable",
      color: "primary",
    },
    VTextarea: {
      variant: "outlined",
      density: "comfortable",
      color: "primary",
    },
    VSelect: {
      variant: "outlined",
      density: "comfortable",
      color: "primary",
    },
    VBtn: {
      variant: "text",
      color: "primary",
      density: "comfortable",
      rounded: "sm",
    },
    VSwitch: {
      color: "primary",
      density: "comfortable",
    },
    VCard: {
      variant: "outlined",
      rounded: "lg",
    },
    VTabs: {
      color: "primary",
    },
  },
  theme: {
    defaultTheme: "light",
    themes: {
      light: {
        colors: {
          background: "#f3f6f9",
          surface: "#ffffff",
          "surface-variant": "#f7f9fb",
          primary: "#31424f",
          "primary-darken-1": "#253440",
          secondary: "#52606d",
          "secondary-darken-1": "#3b4a58",
          error: "#b75a55",
          success: "#3f855f",
          warning: "#b7792b",
          info: "#56758e",
          "on-background": "#1f2933",
          "on-surface": "#1f2933",
          "on-surface-variant": "#52606d",
          "on-primary": "#ffffff",
          "border-color": "#d5dfe8",
          "border-light": "#e3eaf0",
        },
      },
    },
  },
});

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(vuetify);

app.mount("#app");
