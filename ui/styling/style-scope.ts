﻿import view = require("ui/core/view");
import trace = require("trace");
import visualState = require("ui/styling/visual-state");
import cssSelector = require("ui/styling/css-selector");
import cssParser = require("js-libs/reworkcss");
import VisualState = visualState.VisualState;
import application = require("application");

export class StyleScope {
    // caches all the visual states by the key of the visual state selectors
    private _statesByKey = {};
    private _viewIdToKey = {};

    private _css: string;
    private _cssSelectors: Array<cssSelector.CssSelector>;

    get css(): string {
        return this._css;
    }
    set css(value: string) {
        this._css = value;
        this._cssSelectors = undefined;
        this._reset();
    }

    public addCss(cssString: string): void {
        if (this._css === undefined) {
            this._css = cssString;
        }
        else {
            this._css += cssString;
        }
        this._reset();
        if (this._cssSelectors) {
            var addedCssTree = cssParser.parse(cssString, undefined);
            var addedSelectors = StyleScope.createSelectorsFromSyntaxTree(addedCssTree);
            this._cssSelectors = this._joinCssSelectorsArrays([this._cssSelectors, addedSelectors]);
        }
    }

    public ensureSelectors() {
        if (!this._cssSelectors && (this._css || application.cssSelectorsCache)) {
            var applicationCssSelectors = application.cssSelectorsCache ? application.cssSelectorsCache : null;
            var pageCssSyntaxTree = this._css ? cssParser.parse(this._css, undefined) : null;
            var pageCssSelectors;
            if (pageCssSyntaxTree) {
                pageCssSelectors = StyleScope.createSelectorsFromSyntaxTree(pageCssSyntaxTree);
            }
            this._cssSelectors = this._joinCssSelectorsArrays([applicationCssSelectors, pageCssSelectors]);
        }
    }

    private _joinCssSelectorsArrays(arrays: Array<Array<cssSelector.CssSelector>>): Array<cssSelector.CssSelector> {
        var mergedResult = [];
        var i;
        for (i = 0; i < arrays.length; i++) {
            if (arrays[i]) {
                mergedResult.push.apply(mergedResult, arrays[i]);
            }
        }
        mergedResult.sort((a, b) => a.specificity - b.specificity);

        return mergedResult;
    }

    public applySelectors(view: view.View) {
        if (!this._cssSelectors) {
            return;
        }

        var i,
            selector: cssSelector.CssSelector,
            matchedStateSelectors = new Array<cssSelector.CssVisualStateSelector>()

        // Go trough all selectors - and directly apply all non-state selectors
        for (i = 0; i < this._cssSelectors.length; i++) {
            selector = this._cssSelectors[i];
            if (selector.matches(view)) {
                if (selector instanceof cssSelector.CssVisualStateSelector) {
                    matchedStateSelectors.push(<cssSelector.CssVisualStateSelector>selector);
                } else {
                    selector.apply(view);
                }
            }
        }

        if (matchedStateSelectors.length > 0) {
            // Create a key for all matched selectors for this element
            var key: string = "";
            matchedStateSelectors.forEach((s) => key += s.key + "|");
            //console.log("Created key: " + key + " for " + matchedStateSelectors.length + " state selectors");

            // Associate the view to the created key
            this._viewIdToKey[view._domId] = key;

            // Create visual states for this key if there aren't already created
            if (!this._statesByKey[key]) {
                this._createVisualsStatesForSelectors(key, matchedStateSelectors);
            }
        }
    }

    public getVisualStates(view: view.View): Object {
        var key = this._viewIdToKey[view._domId];
        if (key === undefined) {
            return undefined;
        }

        return this._statesByKey[key];
    }

    private _createVisualsStatesForSelectors(key: string, matchedStateSelectors: Array<cssSelector.CssVisualStateSelector>) {
        var i,
            allStates = {},
            stateSelector: cssSelector.CssVisualStateSelector;

        this._statesByKey[key] = allStates;

        for (i = 0; i < matchedStateSelectors.length; i++) {
            stateSelector = matchedStateSelectors[i];

            var visualState: VisualState = allStates[stateSelector.state];
            if (!visualState) {
                visualState = new VisualState();
                allStates[stateSelector.state] = visualState;
            }

            stateSelector.eachSetter((property, value) => {
                visualState.setters[property.name] = value;
            });
        }
    }

    public static createSelectorsFromSyntaxTree(ast: cssParser.SyntaxTree): Array<cssSelector.CssSelector> {
        var result: Array<cssSelector.CssSelector> = [];

        var rules = ast.stylesheet.rules;
        var rule: cssParser.Rule;
        var filteredDeclarations: cssParser.Declaration[];
        var i;
        var j;

        // Create selectors form AST
        for (i = 0; i < rules.length; i++) {
            rule = rules[i];
            // Skip comment nodes.
            if (rule.type === "rule") {
                // Filter comment nodes.
                filteredDeclarations = rule.declarations.filter((val, i, arr) => { return val.type === "declaration" });
                for (j = 0; j < rule.selectors.length; j++) {
                    result.push(cssSelector.createSelector(rule.selectors[j], filteredDeclarations));
                }
            }
        }

        return result;
    }

    private _reset() {
        this._statesByKey = {};
        this._viewIdToKey = {};
    }
}

export function applyInlineSyle(view: view.View, style: string) {
    try {
        var syntaxTree = cssParser.parse("local { " + style + " }", undefined);
        var filteredDeclarations = syntaxTree.stylesheet.rules[0].declarations.filter((val, i, arr) => { return val.type === "declaration" });
        cssSelector.applyInlineSyle(view, filteredDeclarations);
    } catch (ex) {
        trace.write("Applying local style failed: " + ex, trace.categories.Style);
    }
}
