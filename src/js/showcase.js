import _ from "lodash";
import { createBrowserHistory } from "history";
import Inputmask from "inputmask";
import Handlebars from "handlebars";
import Loading from "./loading";
import numeral from "numeral";
import qs from "querystring";
import store from "store";

export default class showcase {
  constructor() {
    this.history = createBrowserHistory();
  }

  // #region getter/setter
  get api() {
    return window.jga.api;
  }

  set api(data) {
    window.jga.api = data;
    return data;
  }

  get config() {
    return window.jga.config;
  }

  get baseUrl() {
    return `/s/${this.api.advice.id}`;
  }

  set windowTitle(title) {
    document.title = title;
  }
  // #endregion

  /**
   * One-time initialization
   */
  init() {
    this.initCache();
    this.updateAdviceSetDetails();
    this.updatePanes();
    // on page load, save current state
    this.history.replace(`${this.baseUrl}/${location.search}`, this.api);

    // events
    this.handleClickOk();
    this.handleClickBack();
    this.handleClickQuesAns();
    this.handleClickOpenDebug();
    this.handleClickOpenClassic();
    this.listenForUrlChanges();
    this.handleResizeChart();
    this.handleClickToggleMode();
    $("body").tooltip({ selector: "[data-toggle=tooltip]" });
    this.toggleViewMode();
  }

  /**
   * Update 3 panes. This fn is called each time the API updates.
   */
  updatePanes(){
    this.updateMainPane();
    this.updateAnswersList();
    this.updateVariablesList();
  }

  // #region event handlers
  /**
   * "Next" button handler
   */
  handleClickOk() {
    this.$advice.on("submit", "form", e => {
      const $form = $(e.currentTarget);

      // convert values from masked to unmasked for form submission
      const $inputs = this._findFormInput($form);
      $inputs.each((i, el) => {
        const $input = $(el);
        const { inputmask } = $input.data();

        if (inputmask) {
          const unmaskedval = inputmask.unmaskedvalue();
          inputmask.remove();
          $input.val(unmaskedval);
        }

        // while we're here, convert percent to precision value
        if ($input.is("input[data-type=Percent]")) {
          $input.val($input.val() / 100);
        }
      });

      const data = $form.serialize();

      this._loadApi(data).then(()=> {
        // update content
        this.updatePanes();
        // pull querystring from API URL (which has latest passed data)
        const queryString = this.getQuerystringFromUrl(this.api.advice.apiUrl);
        // save state
        this.history.push(`${this.baseUrl}/?${queryString}`, this.api);
      });

      return false; // don't submit form
    });
  }

  /**
   * "Back" button handler
   */
  handleClickBack() {
    this.$advice.on("click", "a[data-action=back]", e => {
      e.preventDefault();
      const { _currIdx } = this.api.display;
      const display = this.api.answers.find((a) => { return a.idx == _currIdx - 1; });
      if (!display) { return; }
      // temp override `display` global prop to insert question into HTML
      this.api.display = display.expand;
      this.updateMainPane();
    });
  }

  /**
   * Click handler for assumption or Q&A
   */
  handleClickQuesAns() {
    $(".answers, .answersByVariable, .assumptions").on("click", ".a > a", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const data = $this.closest("li").data();
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const answer = this.api.answers.find((a) => { return a.idx == data.idx; });
      this.api.display = answer.expand;
      this.api.display.idx = answer.idx;
      this.updateMainPane();
    });
  }

  // #region dropdown menu
  /**
   * Dropdown "Debug" menu click handler. Necessary to append current
   * querystring to new URL before navigating.
   */
  handleClickOpenDebug() {
    this.$advice.on("click", "a[data-action=openDebugWithQuerystring]", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const url = $this.prop("href");
      const queryString = this.getQuerystringFromUrl(this.api.advice.apiUrl);
      window.open(`${url}?${queryString}`);
    });
  }

  /**
   * Dropdown "Classic" menu click handler. Necessary to append current
   * querystring to new URL before navigating.
   */
  handleClickOpenClassic() {
    this.$advice.on("click", "a[data-action=openClassicWithQuerystring]", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const url = $this.prop("href");
      const queryString = this.getQuerystringFromUrl(this.api.advice.apiUrl);
      window.open(`${url}?${queryString}`);
    });
  }

  /**
   * Toggle debug mode / variable visibility
   */
  handleClickToggleMode() {
    $(".toggle-mode").on("click", "[data-action=toggle-mode]", e => {
      e.preventDefault();
      const isDevMode = store.get("showcase-dev-mode");
      let newDevMode;
      if (isDevMode === true) {
        newDevMode = false;
      } else if (isDevMode === false) {
        newDevMode = true;
      } else {
        newDevMode = false;
      }

      store.set("showcase-dev-mode", newDevMode);
      this.toggleViewMode(newDevMode);
    });
  }
  // #endregion

  /**
   * Toggle debug mode / variable visibility and save it to localstore
   * @param {boolean=} isDevMode Optional bool to switch mode
   */
  toggleViewMode(isDevMode = store.get("showcase-is-dev-mode")) {
    if (isDevMode) {
      $(".variables-container").fadeIn("fast");
    } else {
      $(".variables-container").fadeOut("fast");
    }
  }

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
   * The interactive chart embed is inside an iframe and when the window resizes
   * the iframe needs to be re-loaded.
   */
  handleResizeChart() {
    let timer;
    $(window).resize(() => {
      if (this.api.display.type == "ADVICE" &&
      this.api.display.attachment &&
      this.api.display.attachment.contentType == "application/vnd+interactive.chart+html") {
        if (timer) {
          window.clearTimeout(timer);
        }
        timer = setTimeout(() => {
          this.updateMainPane();
        }, 500);
      }
    });
  }
  // #endregion

  // #region data
  /**
   * Capture new form data, merge with current state and make new Advice API request.
   * @param {object} newFormData Form data from input request.
   * @returns Promise<jqXHR>
   */
  _loadApi(newFormData){
    // pull querystring from API URL (which has latest passed data)
    const currFormData = this.getQuerystringFromUrl(this.api.advice.apiUrl, true);
    const formData = _.assign({}, currFormData, qs.parse(newFormData));
    const [apiUrlWithoutQuerystring] = this.api.advice.apiUrl.split("?");
    const loadingId = Loading.show($(".row.no-gutters .advice"));

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
      alert(err);
    });
  }

  /**
	 * Util to pick the querystring from a URL
   * @param {string} url
   * @param {boolean=} parse Optional bool to parse the URL into an object.
   * @returns String or Object, depending on `parse`
	 */
  getQuerystringFromUrl(url, parse = false) {
    const str = url.substring(url.indexOf("?") + 1);
    return (parse) ? qs.parse(str) : str;
  }
  // #endregion

  // #region templating
  /**
	 * Update center Advice/Question pane
	 */
  updateMainPane(){
    // update the window title
    this.windowTitle = `${this.api.advice.title} - ${this.api.advice.owner.name}`;

    this._setCurrentIdx();

    // render
    if (this.api.display.type == "INPUT_REQUEST") {
      this._updateForInputRequest();
    } else {
      this._updateForAdvice();
    }

    this.updateRecommendationsList();
  }

  // #region templating utils
  /**
   * Template update for INPUT_REQUEST
   */
  _updateForInputRequest() {
    const { display: { form: { fieldType } } } = this.api;
    this.api.display.form.fieldType_isRadio = fieldType == "Radio";
    this.api.display.form.fieldType_isBoolean = fieldType == "Boolean";
    this.api.display.form.fieldType_isFreetext = fieldType == "Freetext";
    this.api.display.form.fieldType_isMultipleChoice = fieldType == "MultipleChoice";
    this.api.display.form.fieldType_isNumber = fieldType == "Number";
    this.api.display.form.fieldType_isPercent = fieldType == "Percent";
    this.api.display.form.fieldType_isSelect = fieldType == "Select";

    // render
    const str = this.TEMPLATES["InputRequest"](this.api);
    this.$advice.html(str);

    // set value
    this._setValue();
    // set input masks
    this._handleInputMasks();
    // focus input
    this._focusFirstInput();
    // highlight active assumption/question
    this._setAssumptionActive();
  }

  /**
   * Template update for ADVICE
   */
  _updateForAdvice() {
    const isUnreachable = this.api.display.id === "-32768";
    if (isUnreachable){
      this.api.display = Object.assign(this.api.display, {
        headline: "Advice Engine Response",
        summary: "This rule has been evaluated, see variable data for export."
      });
    }

    // determine if this is an interactive chart attachment
    const { attachment } = this.api.display;
    let isChart = false;
    if (attachment) {
      isChart = attachment.contentType == "application/vnd+interactive.chart+html";
      // handlebars helper
      attachment._isInteractiveChart = isChart;
    }

    // render
    const str = this.TEMPLATES["Advice"](this.api);
    this.$advice.html(str);

    // setup the chart...
    if (isChart) {
      // parent container
      const containerW = this.$advice.width();

      // specific data chart is expecting
      // TODO: clean this up in the chart code
      window.jga.config = {
        adviceSetId: this.api.advice.id,
        bgColor: "#fff",
        colors: ["#605F5E", "#6D256C"],
        width: containerW,
        height: 400
      }
      window.jga.advice = {
        session: Object.assign({
          ruleSetId: this.api.advice._id,
          ruleId: this.api.display.ruleId,
        }, this.getQuerystringFromUrl(this.api.advice.apiUrl, true))
      }

      // set chart container size
      $(".advice-chart--interactive").css({
        height: 400,
        width: containerW
      });
    }

    // unhighlight active assumption/question
    this._setAssumptionActive("advice");
  }

  /**
   * Slight speed update to cache frequently-used templates and selectors
   */
  initCache() {
    // cache element selectors
    this.$advice = $(".advice");
    // cache templates
    this.TEMPLATES = {
      "AdviceSetDetails": Handlebars.compile($("#tmpl_adviceSetDetails").html()),
      "InputRequest": Handlebars.compile($("#tmpl_adviceInputRequest").html()),
      "Advice": Handlebars.compile($("#tmpl_adviceAdvice").html()),
      "Recommendations": Handlebars.compile($("#tmpl_groupedRecommendationsAdviceList").html()),
      "Variables": Handlebars.compile($("#tmpl_variablesList").html()),
      "Assumptions": Handlebars.compile($("#tmpl_assumptionsList").html()),
      "QuestionsAnswers": Handlebars.compile($("#tmpl_answersList").html()),
    };
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
	 * Update Advice Set details (left side)
	 */
  updateAdviceSetDetails(){
    // render
    const str = this.TEMPLATES["AdviceSetDetails"](this.api);
    $(".advice-set-details").html(str);
  }

  /**
	 * Update answers/history list
	 */
  updateAnswersList(){
    // add row # to list
    this.api.answers = this.api.answers.map(a => {
      a._count = a.idx + 1;
      return a;
    });

    // do we have ANY assumptions/answers yet?
    // show or hide depending
    $(".assumptions-container").toggle(this.api.answers.length > 0);

    // render
    const str = this.TEMPLATES["QuestionsAnswers"](this.api);
    const strAssump = this.TEMPLATES["Assumptions"](this.api);
    $(".answers").html(str);
    $(".assumptions").html(strAssump);
  }

  /**
	 * Update advice list by group
	 */
  updateRecommendationsList() {
    // simple helper for UX
    this.api._recommendationsExist = _.flatMap(this.api.recommendations).length > 0;
    // massage data for handlebars templating
    Object.keys(this.api.recommendations).forEach((key, idx) => {
      let arr = this.api.recommendations[key];
      let groupDisplayName = "Recommendations";
      try {
        groupDisplayName = _.first(arr).expand.tagGroup.name;
      // eslint-disable-next-line no-empty
      } catch (e) {}
      arr = arr.map(a => {
        // use thumbs up icon by default
        let icon = "fad fa-thumbs-up";
        // support To Do/Completed checklist icons
        if (groupDisplayName.includes("To Do")) {
          icon = "far fa-circle";
        } else if (groupDisplayName.includes("Completed")) {
          icon = "far fa-check-circle";
        }
        // save the helper for handlebars
        a._icon = icon;
        return a;
      });
      this.api.recommendations[groupDisplayName] = arr;
      delete this.api.recommendations[key];
    });

    // render
    const strAll = this.TEMPLATES["Recommendations"](this.api);
    $(".list-all-recommendations").html(strAll);
  }

  /**
   * Change the highlighted assumption in the list based on
   * active display.
   */
  _setAssumptionActive(isAdvice){
    const { id } = this.api.display;
    if (isAdvice) {
      $("ul li").siblings().removeClass("active");
    } else {
      $(`ul li[data-id=${id}]`).addClass("active").siblings().removeClass("active");
    }
  }

  /**
	 * Update variables list
	 */
  updateVariablesList(){
    // add formatted value to vars
    this.api.variables = this.api.variables.map(v => {
      if (v.format) {
        v.valueF = numeral(v.value).format(v.format);
      }
      return v;
    });
    // render
    const str = this.TEMPLATES["Variables"](this.api);
    $(".variables").html(str);
  }
  // #endregion

  // #region form utils
  /**
	 * Set the form value from the API data
	 */
  _setValue() {
    let { value } = this.api.display.form.result;
    if (!value || value == "\"null\"") { return; }

    const $formEls = $(".advice form").find("input,select");
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
  _handleInputMasks(){
    const $inputEl = this._findFormInput(this.$advice.find("form"));
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
  _focusFirstInput() {
    // focus 1st input
    this._findFormInput(this.$advice.find("form"), "input,textarea,select").first().focus();
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