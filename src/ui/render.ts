import { Component, MarkdownRenderer } from "obsidian";
import { DataArray } from "api/data-array";
import { QuerySettings } from "settings";
import { currentLocale } from "util/locale";
import { renderMinimalDate, renderMinimalDuration } from "util/normalize";
import { Literal, Values } from "data-model/value";

/** Make an Obsidian-friendly internal link. */
export function createAnchor(text: string, target: string, internal: boolean): HTMLAnchorElement {
    let a = document.createElement("a");
    a.dataset.href = target;
    a.href = target;
    a.text = text;
    a.target = "_blank";
    a.rel = "noopener";
    if (internal) a.addClass("internal-link");

    return a;
}

/** Render simple fields compactly, removing wrapping content like paragraph and span. */
export async function renderCompactMarkdown(
    markdown: string,
    container: HTMLElement,
    sourcePath: string,
    component: Component
) {
    let subcontainer = container.createSpan();
    await MarkdownRenderer.renderMarkdown(markdown, subcontainer, sourcePath, component);

    let paragraph = subcontainer.querySelector("p");
    if (subcontainer.children.length == 1 && paragraph) {
        while (paragraph.firstChild) {
            subcontainer.appendChild(paragraph.firstChild);
        }
        subcontainer.removeChild(paragraph);
    }
}

/** Create a list inside the given container, with the given data. */
export async function renderList(
    container: HTMLElement,
    elements: Literal[],
    component: Component,
    originFile: string,
    settings: QuerySettings
) {
    let listEl = container.createEl("ul", { cls: ["dataview", "list-view-ul"] });
    for (let elem of elements) {
        let li = listEl.createEl("li");
        await renderValue(elem, li, originFile, component, settings, true, "list");
    }
}

/** Create a table inside the given container, with the given data. */
export async function renderTable(
    container: HTMLElement,
    headers: string[],
    values: Literal[][],
    component: Component,
    originFile: string,
    settings: QuerySettings
) {
    let tableEl = container.createEl("table", { cls: ["dataview", "table-view-table"] });

    let theadEl = tableEl.createEl("thead", { cls: "table-view-thead" });
    let headerEl = theadEl.createEl("tr", { cls: "table-view-tr-header" });
    for (let header of headers) {
        headerEl.createEl("th", { text: header, cls: "table-view-th" });
    }

    let tbodyEl = tableEl.createEl("tbody", { cls: "table-view-tbody" });
    for (let row of values) {
        let rowEl = tbodyEl.createEl("tr");
        for (let value of row) {
            let td = rowEl.createEl("td");
            await renderValue(value, td, originFile, component, settings, true);
        }
    }
}

/** Render a pre block with an error in it; returns the element to allow for dynamic updating. */
export function renderErrorPre(container: HTMLElement, error: string): HTMLElement {
    let pre = container.createEl("pre", { cls: ["dataview", "dataview-error"] });
    pre.appendText(error);
    return pre;
}

/** Render a static codeblock. */
export function renderCodeBlock(container: HTMLElement, source: string, language?: string): HTMLElement {
    let code = container.createEl("code", { cls: ["dataview"] });
    if (language) code.classList.add("language-" + language);
    code.appendText(source);
    return code;
}

/** Render a span block with an error in it; returns the element to allow for dynamic updating. */
export function renderErrorSpan(container: HTMLElement, error: string): HTMLElement {
    let pre = container.createEl("span", { cls: ["dataview", "dataview-error"] });
    pre.appendText(error);
    return pre;
}

export type ValueRenderContext = "root" | "list";

/** Prettily render a value into a container with the given settings. */
export async function renderValue(
    field: Literal,
    container: HTMLElement,
    originFile: string,
    component: Component,
    settings: QuerySettings,
    expandList: boolean = false,
    context: ValueRenderContext = "root",
    depth: number = 0
) {
    // Prevent infinite recursion.
    if (depth > settings.maxRecursiveRenderDepth) {
        container.appendText("...");
        return;
    }

    if (Values.isNull(field)) {
        await renderCompactMarkdown(settings.renderNullAs, container, originFile, component);
    } else if (Values.isDate(field)) {
        container.appendText(renderMinimalDate(field, settings, currentLocale()));
    } else if (Values.isDuration(field)) {
        container.appendText(renderMinimalDuration(field));
    } else if (Values.isString(field) || Values.isBoolean(field) || Values.isNumber(field)) {
        await renderCompactMarkdown("" + field, container, originFile, component);
    } else if (Values.isLink(field)) {
        await renderCompactMarkdown(field.markdown(), container, originFile, component);
    } else if (Values.isHtml(field)) {
        container.appendChild(field);
    } else if (Values.isFunction(field)) {
        container.appendText("<function>");
    } else if (Values.isArray(field) || DataArray.isDataArray(field)) {
        if (expandList) {
            let list = container.createEl("ul", {
                cls: [
                    "dataview",
                    "dataview-ul",
                    context == "list" ? "dataview-result-list-ul" : "dataview-result-list-root-ul",
                ],
            });
            for (let child of field) {
                let li = list.createEl("li", { cls: "dataview-result-list-li" });
                await renderValue(child, li, originFile, component, settings, expandList, "list", depth + 1);
            }
        } else {
            if (field.length == 0) {
                container.appendText("<empty list>");
                return;
            }

            let span = container.createEl("span", { cls: ["dataview", "dataview-result-list-span"] });
            let first = true;
            for (let val of field) {
                if (first) first = false;
                else span.appendText(", ");

                await renderValue(val, span, originFile, component, settings, expandList, "list", depth + 1);
            }
        }
    } else if (Values.isObject(field)) {
        // Don't render classes in case they have recursive references; spoopy.
        if (field?.constructor?.name && field?.constructor?.name != "Object") {
            container.appendText(`<${field.constructor.name}>`);
            return;
        }

        if (expandList) {
            let list = container.createEl("ul", { cls: ["dataview", "dataview-ul", "dataview-result-object-ul"] });
            for (let [key, value] of Object.entries(field)) {
                let li = list.createEl("li", { cls: ["dataview", "dataview-li", "dataview-result-object-li"] });
                li.appendText(key + ": ");
                await renderValue(value, li, originFile, component, settings, expandList, "list", depth + 1);
            }
        } else {
            if (Object.keys(field).length == 0) {
                container.appendText("<empty object>");
                return;
            }

            let span = container.createEl("span", { cls: ["dataview", "dataview-result-object-span"] });
            let first = true;
            for (let [key, value] of Object.entries(field)) {
                if (first) first = false;
                else span.appendText(", ");

                span.appendText(key + ": ");
                await renderValue(value, span, originFile, component, settings, expandList, "list", depth + 1);
            }
        }
    } else {
        container.appendText("Unrecognized: " + JSON.stringify(field));
    }
}
