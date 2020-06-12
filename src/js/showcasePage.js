import _ from "lodash";
import copy from "clipboard-copy";
import { createBrowserHistory } from "history";
import Handlebars from "handlebars";
import Inputmask from "inputmask";
import Loading from "./loading";
import qs from "querystring";

export default class ShowcasePage {
  constructor(){
    this.history = createBrowserHistory();

    // handlebars helpers
    Handlebars.registerHelper("ifEquals", function(arg1, arg2, options) {
      return (arg1=== arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper("ifNotEquals", function(arg1, arg2, options) {
      return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
    });
  }

  /**
   * Page onload, one time
   */
  init(){
    // set the base URL for loading data
    window.jga.api.adviceset.apiUrl = `${this.config.api_host}/_/advice/api/${this.api.adviceset.id}`;
    // helpers
    $("body").tooltip({ selector: "[data-toggle=tooltip]" });
    // events
    this.handleCopyLink();
  }

  // #region getter/setter
  get api() {
    return window.jga.api;
  }

  set api(data) {
    window.jga.api = data;
  }

  get config() {
    return window.jga.config;
  }

  get baseUrl() {
    return `/s/${this.api.adviceset.id}`;
  }

  // eslint-disable-next-line accessor-pairs
  set windowTitle(title) {
    document.title = title;
  }
  // #endregion

  // #region data
  /**
   * Capture new form data, merge with current state and make new Advice API request.
   * @param {object} newFormData Form data from input request.
   * @returns Promise<jqXHR>
   */
  _loadApi(newFormData, $loadingContainer){
    // pull querystring from API URL (which has latest passed data)
    const currFormData = qs.parse(this.api.adviceset._apiUrlQuery);
    const formData = _.assign({ include: ["filteredVars"], showcase: true }, currFormData, qs.parse(newFormData));
    const [apiUrlWithoutQuerystring] = this.api.adviceset.apiUrl.split("?");
    const loadingId = Loading.show($loadingContainer);

    return $.ajax({
      url: apiUrlWithoutQuerystring,
      type: "GET",
      dataType: "json",
      headers: {
        "Accept": "application/json; chartset=utf-8",
        "Authorization": `Bearer ${this.config.api_key}`
      },
      data: formData
    }).then(api => {
      // Advice API (preview mode) can return HTTP 200 (success)
      // with an error, so we'll inject that error into the `adviceset`
      // place, so the error shows up on top.
      if (api.error) {
        this.api = {
          adviceset: {
            id: this.api.adviceset.id,
            title: "Error",
            description: api.error.message
          }
        }
        Loading.hide(loadingId);
        return Promise.reject(new Error(api.error.message));
      }

      // update global!
      this.api = api.data;
      Loading.hide(loadingId);
      return api;
    }).catch((jqXHR) => {
      let err;
      try {
        err = jqXHR.responseJSON.error.message;
      } catch (e){
        err = jqXHR;
      }
      this.showToast(undefined, {
        title: "Just Good Advice",
        message: `${err}`,
        delay: 10000
      });
    });
  }

  /**
   * Set an index on the `display` to allow navigating assumptions list
   */
  _setCurrentIdx() {
    // set the current index based on answers
    // only useful for going "back"
    let currIdx = _.findIndex(this.api.answers, (ans) => { return this.api.display.id == ans.id });
    if (currIdx == -1) {
      currIdx = this.api.answers.length;
    }
    this.api.display._currIdx = currIdx;
    this.api.display._isFirst = currIdx === 0;
  }

  // #endregion

  /**
   * Listen on the browser history for POP actions to update the page.
   */
  listenForUrlChanges() {
    this.history.listen((location, action) => {
      if (action === "POP" && location.state) {
        this.api = location.state;
        this.updatePanes();
      }
    });
  }

  /**
   * Handle click to generate and copy a short URL
   */
  handleCopyLink() {
    $("body").on("click", "a.copy-url", e => {
      e.preventDefault();
      const linkGenId = _.uniqueId("link-gen");
      const url = window.location.href;

      // we can't shorten localhost links
      if (url.includes("localhost")) {
        return copy(url).then(() => {
          this.showToast(linkGenId, {
            title: "Just Good Advice",
            message: "Link copied!"
          });
        });
      }

      // hit the shorten API
      const { display } = this.api;
      const title = display.type == "INPUT_REQUEST" ? display.question : display.headline;

      $.post("/s/api/shorten", {
        long_url: url,
        title: `${this.api.adviceset.title} - ${title}`
      }).then(bitly => {
        // copy to clipboard
        return copy(bitly.link).then(() => {
          this.showToast(linkGenId, {
            title: "Just Good Advice",
            message: "Link copied!"
          });
        });
      }).catch(e => {
        console.error(e);
        this.showToast(linkGenId, {
          title: "Oops",
          message: "Link copying error."
        });
      })
    });
  }

  /**
   *
   * @param {string=} id Optional ID
   * @param {object} opts Toast options
   */
  showToast(id = _.uniqueId("toast"), opts = {}) {
    if (!opts.id) {
      opts.id = id;
    }
    const toast = Handlebars.compile($("#tmpl_toast").html())(opts);
    // insert into DOM
    $("#toastContainer").append(toast);
    // init Toast component
    $(`#${id}`).toast({
      delay: opts.delay || 2000
    }).on("hidden.bs.toast", function() {
      $(this).remove(); // remove it when it's been hidden
    }).toast("show"); // finally show it
  }

  // #region form utils
  /**
	 * Set the form value from the API data
	 */
  _setValue($container = this.$advice) {
    const { display: { form: { fieldType } } } = this.api;
    let { display: { value } } = this.api;
    if (!value || value == "\"null\"") { return; }

    const $formEls = $container.find("form").find("input,select");
    $formEls.each((i, el) => {
      const $el = $(el);
      if ($el.is(":radio")) {
        if ($el.prop("value") == value || $el.prop("value") == "\""+value+"\"") {
          $el.prop("checked", true)
        }
      } else {
        // precision-to-display
        if (fieldType == "Percent") {
          value = value * 100;
        }
        $el.val(value);
      }
    });
  }

  /**
   * Setup form input masks based on type
   * https://github.com/RobinHerbots/Inputmask#mask
   */
  // eslint-disable-next-line complexity
  _handleInputMasks($container = this.$advice){
    const $inputEl = this._findFormInput($container.find("form"));
    if ($inputEl.length) {
      const maskOpts = {
        showMaskOnHover: false
      };
      const { fieldType, properties } = this.api.display.form;
      const { range = {} } = properties;
      let { format: formatStr = "" } = properties;

      // if min & max attrs are present, pass them to the mask
      const { min, max } = range;
      if (min !== "undefined") {
        $inputEl.prop("min", min);
        maskOpts.min = min;
      }
      if (max !== "undefined") {
        $inputEl.prop("max", max);
        maskOpts.max = max;
      }

      // coerce to string for conditional test below
      formatStr = String(formatStr);

      // https://github.com/RobinHerbots/Inputmask/blob/4.x/README_numeric.md#aliases
      // https://github.com/RobinHerbots/Inputmask/blob/5.x/lib/extensions/inputmask.numeric.extensions.js#L442
      switch (fieldType) {
        case "Number":
          maskOpts.alias = "numeric";
          maskOpts.showMaskOnFocus = false;

          // check format to see if we need a different mask
          if (formatStr.includes("$")) {
            maskOpts.alias = "currency";
            maskOpts.digitsOptional = true;
            maskOpts.prefix = "$ ";
            maskOpts.showMaskOnFocus = true;
          }
          break;
        case "Percent":
          maskOpts.alias = "percentage";
          // Get the number of decimal points if decimal is present
          if (formatStr.indexOf(".") != -1){
            maskOpts.digits = formatStr.indexOf("%") - formatStr.indexOf(".") - 1;
          }
          break;
        case "Date":
          maskOpts.alias = "datetime";
          break;
      }

      if (maskOpts.mask || maskOpts.alias) {
        const im = new Inputmask(maskOpts).mask($inputEl.get(0));
        $inputEl.data("inputmask", im);
      }
    }
  }

  /**
	 * Focus the 1st visible input on the question form for quicker UX.
	 */
  _focusFirstInput($container = this.$advice) {
    // focus 1st input
    this._findFormInput($container.find("form"), "input,textarea,select").first().focus();
  }

  /**
   * Find input element
   * @param {jquery} $form Form element
   * @param {string=} types Comma-separated list of HTML tags, e.g., "input,select"
   */
  _findFormInput($form, types = "input") {
    return $form.find(types).filter(":not(:radio):not(:hidden)");
  }
  // #endregion
}