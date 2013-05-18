/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */
/*
 * extension.js
 * Copyright (C) 2012-2013 thof <radlewand@gmail.com>
 * 
 * gnome-shell-extension-gstranslator2 is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * gnome-shell-extension-gstranslator3 is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License along
 * with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Panel = imports.ui.panel;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;
const Lang = imports.lang;
const Soup = imports.gi.Soup;

const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Lib = Extension.imports.lib;
const Trans = Extension.imports.translator;

const schema = "org.gnome.shell.extensions.gstranslator2";
const BASIC = 0, EXPANDED = 1;
const PREV = 0, NEXT = 1; 

let gstrans;
let monitor = Main.layoutManager.primaryMonitor;

const key_bindings = {
	'get-translation': function() {
		gstrans.get_trans(BASIC);
	},
	'get-expanded-translation': function() {
		gstrans.get_trans(EXPANDED);
	},
	'next-langs': function() {
		gstrans.change_langs(NEXT);
	},
	'prev-langs': function() {
		gstrans.change_langs(PREV);
	},
	'toggle-menu': function() {
		gstrans.toggle_menu();
	},
};

const Gstranslator = new Lang.Class({
    Name: 'Gstranslator',
    Extends: PanelMenu.Button,
   
    _init: function() {
        this.parent(0.0, 'gstranslator');
        
        this.prev_clipboard_content = '';
        this.prev_translation = '';
        this.languages_list = new Array();
        
        this.init_settings();
        this.clipboard = St.Clipboard.get_default();
        
        this.gtranslator = new Trans.GoogleTranslator(this.languages_list[this.current_langs][0], 
                            this.languages_list[this.current_langs][1], this.line_width);
        
        
        // init menu
        let status_label = new St.Label({ style_class: 'panel-label', text: 'T' });
        this.actor.add_actor(status_label);
        
        let main_box = new St.BoxLayout({ style_class: 'main-box', vertical:false });
        
        let section = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(section);
        
        this.search_entry = new St.Entry({ name: 'searchEntry', hint_text: "Type to search...", track_hover: true, can_focus: true });
        let search_entry_text = this.search_entry.clutter_text;
        search_entry_text.connect('key-press-event', Lang.bind(this, this._on_key_press));
        search_entry_text.connect('key-release-event', Lang.bind(this, this._on_key_release));
        
        this.langs_label_menu = new St.Label({ style_class: 'lang-label'});
        this.update_langs_label();
        
        let auto_close = new PopupMenu.PopupSwitchMenuItem("Autoclose", this.auto_close_val);
        auto_close.connect('toggled', this._change_auto_close);
        
        main_box.add(this.search_entry);
        main_box.add(this.langs_label_menu);

        section.actor.add_actor(main_box);
        this.menu.addMenuItem(auto_close);
        
        Main.panel.menuManager.addMenu(this.menu);
        this.menu.connect('open-state-changed', Lang.bind(this, this._on_open_state_toggled));
        let position = Main.panel._rightBox.get_children().length-1;
        Main.panel.addToStatusArea('gstranslator', this, position);
        
        // init traslation box
        this.trans_box = new St.BoxLayout({style_class: "main-dialog",
	        vertical: true
        });
        Main.uiGroup.add_actor(this.trans_box);
        
        this.content = new St.BoxLayout({vertical: true});
        this.trans_box.add(this.content);
        
        this.translation_label = new St.Label({ style_class: 'main-label'});
        
        // init languages info
        this.langs_label = new St.Label({ style_class: 'lang-label'});
    },
    
    init_settings: function() {
        this.settings = new Lib.Settings(schema).getSettings();
        
        this.position = parseInt(this.settings.get_string("position"));
        this.xoffset = parseInt(this.settings.get_string("xoffset"));
        this.yoffset = parseInt(this.settings.get_string("yoffset"));
        this.auto_close_val = parseInt(this.settings.get_string("auto-close"));
        this.height = parseInt(this.settings.get_string("height"));
        this.line_width = parseInt(this.settings.get_string("width"));
        this.load_languages(this.settings.get_string("items"));
        
        for(let key in key_bindings) {
            Main.wm.addKeybinding(key, 
                this.settings, 
                Meta.KeyBindingFlags.NONE,
                Shell.KeyBindingMode.NORMAL | Shell.KeyBindingMode.MESSAGE_TRAY,
                key_bindings[key]
            );
	    }
    },
    
    load_languages: function(lang_list) {
        let langs = lang_list.split('|');
        let j=0;
        for(let i=0; i<langs.length; i++){
            let temp = langs[i].split(';')
            if(parseInt(temp[2])){
                this.languages_list.push([])
                this.languages_list[j].push(temp[0]);
                this.languages_list[j].push(temp[1]);
                j++;
            }
        }
        this.current_langs = 0;
    },
    
    show_trans: function(translation) {
        if (translation != null){
	        this.translation_label.set_text(translation);
            this.content.add(this.translation_label);
            this.get_position(this.translation_label);
            this.trans_box.set_x(this.x);
            this.trans_box.set_y(this.y);
        }
    },
    
    hide_trans: function() {
        if (this.content.contains(this.translation_label)) {
            this.content.remove_all_children();
            return true;
        }
        return false;
    },
    
    get_trans: function(mode, text_to_translate) {
        text_to_translate = text_to_translate || '';
        
        // show dialog with translation
        if (text_to_translate != '') {
            // translate from input field
            global.log("GST: Translate from input dialog");
            this.hide_trans();
            this.gtranslator.translate(text_to_translate, mode, Lang.bind(this, this._async_set_trans));
            this.mode = mode;
            this.clipboard.get_text(St.ClipboardType.PRIMARY, Lang.bind(this, Lang.bind(this, function(clipboard, clipboard_content) {
                this.prev_clipboard_content = clipboard_content;
            })));
        } else {
            if (!this.hide_trans()) {
                // translate from clipboard
                this.use_clipboard_1(mode);
            } else {       
                this.use_clipboard_2(mode);
            }
        }
    },

    _async_set_trans: function(translation) {
        //global.log('Translation: '+translation);
        this.show_trans(translation);
        this.prev_translation = translation;
    },
    
    use_clipboard_1: function(mode){
        this.clipboard.get_text(St.ClipboardType.PRIMARY, Lang.bind(this, Lang.bind(this, function(clipboard, clipboard_content) {
            global.log("Clip cont: "+clipboard_content+" | Prev cont: "+this.prev_clipboard_content);
            global.log("UseClip1: "+mode+" = "+this.mode);
            if (clipboard_content != null && clipboard_content != this.prev_clipboard_content){
                // when content of clipboard has been changed
                global.log("GST: Translate from current clipboard /1");
                this.gtranslator.translate('', mode, Lang.bind(this, this._async_set_trans));
                this.prev_clipboard_content = clipboard_content;
            } else {
                // when content of clipboard has not been changed
                if (this.mode != mode) {
                    global.log("GST: Translate from previous clipboard /1");
                    this.gtranslator.translate(this.prev_clipboard_content, mode, Lang.bind(this, this._async_set_trans));
                } else {
                    global.log("GST: Show cached translation");
                    this.show_trans(this.prev_translation);
                }
            }
            this.mode = mode;
        })));
    },
    
    use_clipboard_2: function(mode) {
        this.clipboard.get_text(St.ClipboardType.PRIMARY, Lang.bind(this, Lang.bind(this, function(clipboard, clipboard_content) {
            global.log("Clip cont: "+clipboard_content+" | Prev cont: "+this.prev_clipboard_content);
            global.log("UseClip2: "+mode+" = "+this.mode);
            if (this.mode != mode) {
                global.log("Diff mode");
                if (clipboard_content != null && clipboard_content != this.prev_clipboard_content){
                    global.log("GST: Translate from current clipboard /2");
                    this.gtranslator.translate('', mode, Lang.bind(this, this._async_set_trans));
                } else {
                    global.log("GST: Translate from previous clipboard /2");
                    this.gtranslator.translate(this.prev_clipboard_content, mode, Lang.bind(this, this._async_set_trans));
                }
            } else {
                global.log("Same mode");
                if (clipboard_content != null && clipboard_content != this.prev_clipboard_content){
                    global.log("GST: Translate from current clipboard /3");
                    this.gtranslator.translate('', mode, Lang.bind(this, this._async_set_trans));
                    this.prev_clipboard_content = clipboard_content;
                }
            }
            this.mode = mode;
        })));
    },
    
    get_position: function(label_position) {
        let text_height = label_position.height;
        if (label_position.height>this.height){
            text_height = this.height;
        }
        switch(this.position){
            case 0:
                this.x = 0+this.xoffset;
                this.y = 0+this.yoffset;
                break;
            case 1:
                this.x = Math.floor(monitor.width-label_position.width)-this.xoffset;
                this.y = 0+this.yoffset;
                break;
            case 2:
                this.x = 0+this.xoffset;
                this.y = Math.floor(monitor.height-text_height)-this.yoffset;
                break;
            case 3:
                this.x = Math.floor(monitor.width-label_position.width)-this.xoffset;
                this.y = Math.floor(monitor.height-text_height)-this.yoffset;
                break;
        }
    },
    
    // helper functions for menu
    _change_auto_close: function(clicked_actor) {
        if(this.auto_close_val) {
            this.settings.set_string('auto-close', '0');
            this.auto_close_val = 0;
        }
	    else {
	        this.settings.set_string('auto-close', '1');
            this.auto_close_val = 1;
	    }
    },

    toggle_menu: function() {
        this.menu.toggle();
    },

    reset_search: function() {
        this.search_entry.set_text('');
        global.stage.set_key_focus(this.search_entry);
    },

    // functions responsible for handling languages
    update_langs_label: function() {
        this.langs_label_menu.set_text(this.languages_list[this.current_langs][0]+" -> "+this.languages_list[this.current_langs][1]);
    },

    change_langs: function(direction) {
        this.prev_clipboard_content = "*reset*";
        if (direction == NEXT){
            if (this.current_langs == this.languages_list.length-1){
                this.current_langs = 0;
            } else {
                this.current_langs++;
            }
        } else {
            if (this.current_langs == 0){
                this.current_langs = this.languages_list.length-1;
            } else {
                this.current_langs--;
            }
        }
        this.gtranslator.set_langs(this.languages_list[this.current_langs][0], this.languages_list[this.current_langs][1]);
        this.update_langs_label();
        this.show_lang_info();
    },

    show_lang_info: function() {
        this.langs_label.set_text(this.languages_list[this.current_langs][0]+" -> "+this.languages_list[this.current_langs][1]);
        if (!Main.uiGroup.contains(this.langs_label)){
            Main.uiGroup.add_actor(this.langs_label);
        }
        
        this.langs_label.set_position(Math.floor(monitor.width/2), Math.floor(monitor.height/2));
        Tweener.removeTweens(this.langs_label)
        Tweener.addTween(this.langs_label, { time: 3, onComplete: Lang.bind(this, this._hide_lang_info)});
    },

    _hide_lang_info: function() {
        if(Main.uiGroup.contains(this.langs_label)) {
            Main.uiGroup.remove_actor(this.langs_label);
        }
    },
    
    _on_key_release: function(actor, event) {
        if(this.search_entry.get_text() == ''){
            this.hide_trans();
        }
    },

    
    _on_key_press: function(actor, event) {
        let symbol = event.get_key_symbol();
        let state = event.get_state();
        if(symbol == Clutter.KEY_Return) {
            let text_trans = this.search_entry.get_text().replace(/^\s+|\s+$/g, '');
            if(this.auto_close_val) {
                this.menu.close();
            }
            if(text_trans != '') {
                if(state & state.SHIFT_MASK == state.SHIFT_MASK) {
                    this.get_trans(EXPANDED, text_trans);
                    //return true;
                }
                else {
                    this.get_trans(BASIC, text_trans);
                }
            }
        }
        else if(symbol == Clutter.KEY_Right && state == Clutter.ModifierType.CONTROL_MASK) {
            this.change_langs(NEXT);
            //return true;
        }
        else if(symbol == Clutter.KEY_Left && state == Clutter.ModifierType.CONTROL_MASK) {
            this.change_langs(PREV);
            //return true;
        }
        //return false;
    },
    
    _on_open_state_toggled: function(menu, open) {
        if (open) {
            this.reset_search();
        }
    },
});

function init() {
}

function enable() {
    gstrans = new Gstranslator();
}

function disable() {
    for(key in key_bindings) {
		Main.wm.removeKeybinding(key); 
	}
    gstrans.destroy();
    gstrans = null;
}
