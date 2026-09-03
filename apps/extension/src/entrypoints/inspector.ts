import { runPicker } from '../picker/controller.js';

export default defineUnlistedScript({
  globalName: false,
  main() {
    return runPicker('color');
  },
});
