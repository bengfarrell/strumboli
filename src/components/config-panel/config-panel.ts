import { html, LitElement, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styles } from './config-panel.css.js';
import { ControlSchema, NumberControlSchema, PickerControlSchema } from '../../utils/panels/panel-schemas';

import '@spectrum-web-components/number-field/sp-number-field.js';
import '@spectrum-web-components/field-label/sp-field-label.js';
import '@spectrum-web-components/picker/sp-picker.js';
import '@spectrum-web-components/menu/sp-menu-item.js';
import '@spectrum-web-components/checkbox/sp-checkbox.js';

/**
 * Generic configuration panel that renders controls based on a schema
 * For custom panels, simply renders slot content
 */
@customElement('config-panel')
export class ConfigPanel extends LitElement {
    static styles = styles;

    @property({ type: Array })
    controls?: ControlSchema[];

    @property({ type: Object })
    config: Record<string, any> = {};

    @property({ type: String })
    configKey: string = '';

    @property({ type: Boolean })
    disabled: boolean = false;
    
    @property({ type: Boolean })
    isCustom: boolean = false;

    private handleChange(key: string, value: any) {
        this.dispatchEvent(new CustomEvent('config-change', {
            detail: { [`${this.configKey}.${key}`]: value },
            bubbles: true,
            composed: true
        }));
    }

    private renderNumberControl(schema: NumberControlSchema): TemplateResult {
        const value = this.config?.[schema.key] ?? 0;
        return html`
            <sp-field-label for="${schema.key}">${schema.label}</sp-field-label>
            <sp-number-field
                id="${schema.key}"
                .value=${value}
                .step=${schema.step ?? 1}
                .min=${schema.min}
                .max=${schema.max}
                ?disabled="${this.disabled}"
                @change="${(e: Event) => {
                    const target = e.target as any;
                    this.handleChange(schema.key, Number(target.value));
                }}">
            </sp-number-field>
        `;
    }

    private renderPickerControl(schema: PickerControlSchema): TemplateResult {
        const value = this.config[schema.key];
        return html`
            <sp-field-label for="${schema.key}">${schema.label}</sp-field-label>
            <sp-picker
                id="${schema.key}"
                .value="${value ?? schema.options[0]?.value ?? ''}"
                ?disabled="${this.disabled}"
                @change="${(e: Event) => {
                    const target = e.target as HTMLInputElement;
                    this.handleChange(schema.key, target.value);
                }}">
                ${schema.options.map(opt => html`
                    <sp-menu-item value="${opt.value}">${opt.label}</sp-menu-item>
                `)}
            </sp-picker>
        `;
    }

    private renderControl(schema: ControlSchema): TemplateResult {
        switch (schema.type) {
            case 'number':
                return this.renderNumberControl(schema);
            case 'picker':
                return this.renderPickerControl(schema);
            case 'checkbox':
                // Checkboxes are typically handled at the panel level, not here
                return html``;
            default:
                return html`<div>Unsupported control type</div>`;
        }
    }

    render() {
        // For custom panels, just render the slot content
        if (this.isCustom || !this.controls || this.controls.length === 0) {
            return html`<slot></slot>`;
        }
        
        // For schema-driven panels, render controls
        return html`
            <div class="config-group">
                ${this.controls.map(control => this.renderControl(control))}
            </div>
        `;
    }
}

