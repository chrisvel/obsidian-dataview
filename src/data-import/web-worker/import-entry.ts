/** Entry-point script used by the index as a web worker. */
import { runImport } from "data-import/web-worker/import-impl";
import { Transferable } from "data-model/transferable";

onmessage = async evt => {
    let result = runImport(evt.data.path, evt.data.contents, evt.data.metadata);
    (postMessage as any)({ path: evt.data.path, result: Transferable.transferable(result) });
};
