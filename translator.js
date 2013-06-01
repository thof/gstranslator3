const St = imports.gi.St;
const Lang = imports.lang;
const Soup = imports.gi.Soup;

const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());
_httpSession.user_agent = 'GSTranslator3';
_httpSession.timeout = 5;

const URL =
    'http://translate.google.com/translate_a/t?' +
    'client=j&ie=UTF-8&oe=UTF-8&sl=%s&tl=%s&text=%s';
    
const BASIC = 0;

const GoogleTranslator = new Lang.Class({
    Name: 'GoogleTranslator',
    
    _init: function(source_lang, target_lang, line_width) {
        this._source_lang = source_lang;
        this._target_lang = target_lang;
        this._clipboard = St.Clipboard.get_default()
        this._line_width = line_width;
        this._url = URL;
        this._mode = BASIC;
    },

    translate: function(text, mode, callback) {
        this._mode = mode;
        if(!this.is_blank(text)){
            this.translate_text(text, Lang.bind(this, function(translation){
                callback(translation);
            }));
        }
    },
    
    translate_text: function(text, callback) {
        let url = this.make_url(this.delete_non_alpa(text));
        this._get_data_async(url, Lang.bind(this, function(result) {
            let data = this.parse_response(result);
            callback(data);
        }));
    },
    
    _get_data_async: function(url, callback) {
        let request = Soup.Message.new('GET', url);

        _httpSession.queue_message(request, Lang.bind(this,
            function(_httpSession, message) {
                if(message.status_code === 200) {
                    try {
                        callback(request.response_body.data);
                    }
                    catch(e) {
                        log('Error: '+e);
                        callback('');
                    }
                }
                else {
                    callback('');
                }
            }
        ));
    },
    
    make_url: function(text) {
        let result = this._url.format(
            this._source_lang,
            this._target_lang,
            encodeURIComponent(text)
        );
        return result;
    },
    
    parse_response: function(response_data) {
        let json;
        let orig_string = '';
        let trans_string = '';
        let terms_string = '';

        try {
            json = JSON.parse(response_data);
        }
        catch(e) {
            log('%s Error: %s'.format(
                this.name,
                JSON.stringify(e, null, '\t')+"\nResponse_data:\n"+response_data
            ));
            return {
                error: true,
                message: "Can't translate text, please try later."
            };
        }
        
        for(let i = 0; i < json.sentences.length; i++) {
            orig_string += json.sentences[i].orig;
            trans_string += json.sentences[i].trans;
        }
        
        if (trans_string.length < this._line_width[this._mode]){
            trans_string = this.string_divider(orig_string+" - <b>"+trans_string+"</b>");
        } else {
            trans_string = this.string_divider(trans_string);
        }
        
        if(json.dict != undefined) {
            trans_string += "\n\n";
            if (this._mode == BASIC){
                trans_string += this.get_basic_response(json.dict);
            } else {
                trans_string += this.get_expanded_response(json.dict);
            }
        }
        
        let result = trans_string;
        return result;
    },
    
    get_basic_response: function(dict){
        let trans_string = '';
        let terms_string = '';
        
        for(let i = 0; i < dict.length; i++) {
            trans_string += "<i>"+dict[i].pos+"</i>\n";
            for(let j = 0; j < dict[i].terms.length; j++){
                terms_string += dict[i].terms[j] + ", ";
            }
            terms_string = this.string_divider(terms_string);
            trans_string += terms_string.substring(0, terms_string.length-2)+"\n\n";
            
            terms_string = '';
        }
        return trans_string = trans_string.substring(0, trans_string.length-2);
    },
    
    get_expanded_response: function(dict){
        let trans_string = '';
        let terms_string = '';
    
        for(let i = 0; i < dict.length; i++) {
            trans_string += "<i>"+dict[i].pos+"</i>\n";
            for(let j = 0; j < dict[i].entry.length; j++){
                terms_string += "<b>"+dict[i].entry[j].word+"</b> - ";
                if(dict[i].entry[j].reverse_translation != undefined) {
                    for(let k=0; k < dict[i].entry[j].reverse_translation.length; k++){
                        terms_string += dict[i].entry[j].reverse_translation[k]+", ";
                    }
                }
                else {
                    terms_string = terms_string.substring(0, terms_string.length-3);
                }
                terms_string = this.string_divider(terms_string);
                trans_string += terms_string.substring(0, terms_string.length-2)+"\n";
                terms_string = '';
            }
            trans_string += "\n"
        }
        return trans_string = trans_string.substring(0, trans_string.length-2);
    },
    
    string_divider: function(str) {
        if (str.length>this._line_width[this._mode]) {
            let p = this._line_width[this._mode];
            for (;p>0 && str[p]!=' ';p--) { }
            if (p>0) {
                let left = str.substring(0, p);
                let right = str.substring(p+1);
                return left + "\n" + this.string_divider(right);
            }
        }
        return str;
    },
    
    delete_non_alpa: function(str) {
        let charcheck = /[a-zA-Z0-9]/;
        if(this._source_lang == 'en'){
            // delete non-alpha at the beginning
            while(!charcheck.test(str.charAt(0))){
                str = str.substring(1, str.length);
            }
            // delete non-alpha at the end
            while(!charcheck.test(str.charAt(str.length-1))){
                str = str.substring(0, str.length-1);
            }
        }
        str = str.replace(/\-\n/g, '');
        str = str.replace(/\n/g, ' ');
        if(!/[^A-Z]/.test(str)){
            str = str.toLowerCase();
        }
        return str;
    },
    
    set_langs: function(source, target){
        this._source_lang = source;
        this._target_lang = target;
    },
    
    is_blank: function(str) {
        return (!str || /^\s*$/.test(str));
    },
});
