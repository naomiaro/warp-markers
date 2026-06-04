// Custom theme entry: extend the default VitePress theme with our demo
// components, registered globally so chapter pages can use them in Markdown
// without per-page <script setup>.
import DefaultTheme from "vitepress/theme";
import VisualiseDemo from "../../components/VisualiseDemo.vue";
import MeterDemo from "../../components/MeterDemo.vue";
import MessyDataDemo from "../../components/MessyDataDemo.vue";
import RepairDemo from "../../components/RepairDemo.vue";
import RiemannRectangles from "../../components/RiemannRectangles.vue";
import TrapezoidSlices from "../../components/TrapezoidSlices.vue";
import LogarithmicBend from "../../components/LogarithmicBend.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("VisualiseDemo", VisualiseDemo);
    app.component("MeterDemo", MeterDemo);
    app.component("MessyDataDemo", MessyDataDemo);
    app.component("RepairDemo", RepairDemo);
    app.component("RiemannRectangles", RiemannRectangles);
    app.component("TrapezoidSlices", TrapezoidSlices);
    app.component("LogarithmicBend", LogarithmicBend);
  },
};
