import _ from "lodash";
import { createBrowserHistory } from "history";
import Inputmask from "inputmask";
import Handlebars from "handlebars";
import Loading from "./loading";
import numeral from "numeral";
import qs from "querystring";
import store from "store";

const history = createBrowserHistory();

export default class showcase {
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

  init() {
    this.updateAdviceSetDetails();
    this.updatePanes();
    // on page load, save current state
    history.replace(`${this.baseUrl}/${location.search}`, this.api);

    // events
    this.handleClickOk();
    this.handleClickBack();
    this.handleClickQuesAns();
    this.handleClickOpenDebug();
    this.handleClickOpenClassic();
    this.listenForUrlChanges();
    this.loadViewMode();
    this._handleChartResize();
    this.handleClickToggleMode();
    $("body").tooltip({ selector: "[data-toggle=tooltip]" });
  }

  /**
   *
   */
  updatePanes(){
    this.updateMainPane();
    this.updateAnswersList();
    this.updateVariablesList();
  }

  handleClickOk() {
    $(".advice").on("submit", "form", e => {
      const $form = $(e.currentTarget);

      // convert values from masked to unmasked for form submission
      const $inputs = $form.find("input").filter(":not(:radio):not(:hidden)");
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
        history.push(`${this.baseUrl}/?${queryString}`, this.api);
      });

      return false; // don't submit form
    });
  }

  handleClickBack() {
    $(".advice").on("click", "a[data-action=back]", e => {
      e.preventDefault();
      const { _currIdx } = this.api.display;
      const ans = this.api.answers.find((a) => { return a.idx == _currIdx - 1; });
      if (!ans) { return; }
      this.api.display = ans.expand;
      this.updateMainPane();
    });
  }

  handleClickQuesAns() {
    $(".answers, .answersByVariable, .assumptions").on("click", ".a > a", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const data = $this.closest("li").data();
      // temp override `display` global prop to insert question into HTML
      // when user presses "OK" to keep or change answer, global data is refreshed/restored
      const ans = this.api.answers.find((a) => { return a.idx == data.idx; });
      this.api.display = ans.expand;
      this.api.display.idx = ans.idx;
      this.updateMainPane();
    });
  }

  handleClickOpenDebug() {
    $(".advice").on("click", "[data-action=openDebugWithQuerystring]", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const url = $this.prop("href");
      const queryString = this.getQuerystringFromUrl(this.api.advice.apiUrl);
      window.open(`${url}?${queryString}`);
    });
  }

  handleClickOpenClassic() {
    $(".advice").on("click", "[data-action=openClassicWithQuerystring]", e => {
      e.preventDefault();
      const $this = $(e.currentTarget);
      const url = $this.prop("href");
      const queryString = this.getQuerystringFromUrl(this.api.advice.apiUrl);
      window.open(`${url}?${queryString}`);
    });
  }

  handleClickToggleMode() {
    $(".toggle-mode").on("click", "[data-action=toggle-mode]", e => {
      e.preventDefault();
      const isDevMode = store.get("showcase-dev-mode");
      let newMode;
      if (isDevMode === true) {
        newMode = false;
      } else if (isDevMode === false) {
        newMode = true;
      } else {
        newMode = false;
      }

      store.set("showcase-dev-mode", newMode);
      this.loadViewMode(newMode);
    });
  }

  loadViewMode(newMode = store.get("showcase-dev-mode")) {
    if (newMode) {
      $(".variables-container").fadeIn("fast");
    } else {
      $(".variables-container").fadeOut("fast");
    }
  }

  listenForUrlChanges() {
    history.listen((location, action) => {
      if (action === "POP" && location.state) {
        this.api = location.state;
        this.updatePanes();
      }
    });
  }

  _loadApi(newFormData){
    // pull querystring from API URL (which has latest passed data)
    const currFormData = qs.parse(this.getQuerystringFromUrl(this.api.advice.apiUrl));
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
      // update global
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
	 * Update center Advice/Question pane
	 */
  updateMainPane(){
    // update the window title
    this.windowTitle = `${this.api.advice.title} - ${this.api.advice.owner.name}`;

    // set the current index based on answers
    // only useful for going "back"
    let currIdx = _.findIndex(this.api.answers, (ans) => { return this.api.display.id == ans.id });
    if (currIdx == -1) {
      currIdx = this.api.answers.length;
    }
    this.api.display._currIdx = currIdx;
    this.api.display._isFirst = currIdx === 0;

    // render
    let str;
    if (this.api.display.type == "INPUT_REQUEST") {
      this.api.display.form.fieldType_isRadio = this.api.display.form.fieldType == "Radio";
      this.api.display.form.fieldType_isBoolean = this.api.display.form.fieldType == "Boolean";
      this.api.display.form.fieldType_isFreetext = this.api.display.form.fieldType == "Freetext";
      this.api.display.form.fieldType_isMultipleChoice = this.api.display.form.fieldType == "MultipleChoice";
      this.api.display.form.fieldType_isNumber = this.api.display.form.fieldType == "Number";
      this.api.display.form.fieldType_isPercent = this.api.display.form.fieldType == "Percent";
      this.api.display.form.fieldType_isSelect = this.api.display.form.fieldType == "Select";

      str = Handlebars.compile($("#tmpl_adviceInputRequest").html())(this.api);
      $(".advice").html(str);
      // set value
      this._setValue();
      // set input masks
      this._handleInputMasks();
      // focus input
      this._focusFirstInput();
      // highlight active assumption/question
      this._setAssumptionActive();
    } else {
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

      str = Handlebars.compile($("#tmpl_adviceAdvice").html())(this.api);
      $(".advice").html(str);

      // setup the chart...
      if (isChart) {
        // parent container
        const containerW = $(".advice").width();

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
          }, qs.parse(this.getQuerystringFromUrl(this.api.advice.apiUrl)))
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

    this.updateRecommendationsList();
  }

  /**
	 * Update Advice Set details (left side)
	 */
  updateAdviceSetDetails(){
    // render
    const str = Handlebars.compile($("#tmpl_adviceSetDetails").html())(this.api);
    $(".advice-set-details").html(str);
  }

  /**
	 * Update answers/history list (right side)
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
    const str = Handlebars.compile($("#tmpl_answersList").html())(this.api);
    // const strVar = Handlebars.compile($("#tmpl_answersListByVariable").html(), this.api);
    const strAssump = Handlebars.compile($("#tmpl_assumptionsList").html())(this.api);
    $(".answers").html(str);
    // $(".answersByVariable").html(strVar);
    $(".assumptions").html(strAssump);
  }

  /**
	 *
	 */
  updateRecommendationsList() {
    // simple helper for UX
    this.api._recommendationsExist = _.flatMap(this.api.recommendations).length > 0;
    // massage data for handlebars templating
    Object.keys(this.api.recommendations).forEach((key, idx) => {
      const arr = this.api.recommendations[key];
      let groupDisplayName = "Recommendations";
      try {
        groupDisplayName = _.first(arr).expand.tagGroup.name;
      // eslint-disable-next-line no-empty
      } catch (e) {}
      this.api.recommendations[groupDisplayName] = arr;
      delete this.api.recommendations[key];
    });

    // render
    const strAll = Handlebars.compile($("#tmpl_groupedRecommendationsAdviceList").html())(this.api);
    $(".list-all-recommendations").html(strAll);
  }

  /**
	 * Update variables list (right side)
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
    const str = Handlebars.compile($("#tmpl_variablesList").html())(this.api);
    $(".variables").html(str);
  }

  /**
	 *
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
        if (this.api.display.form.fieldType == "Percent") {
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
    const $inputEl = $(".question").find("form").find("input").filter(":not(:radio):not(:hidden)");
    if ($inputEl.length) {
      const maskOpts = { showMaskOnHover: false };
      const { fieldType, properties } = this.api.display.form;
      const { range = {} } = properties;
      let { format: formatStr = "" } = properties;

      const { min, max } = range;
      if (min !== "undefined") {
        $inputEl.prop("min", min);
      }
      if (max !== "undefined") {
        $inputEl.prop("max", max);
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
          /* else {
            maskOpts.digits = 2; // default to 2 decimal places
          }*/
          break;
        case "Date":
          maskOpts.alias = "datetime";
          break;
      }

      // if min & max attrs are present, pass them to the mask
      if (min){ maskOpts.min = min; }
      if (max) { maskOpts.max = max; }

      if (maskOpts.mask || maskOpts.alias) {
        const im = new Inputmask(maskOpts).mask($inputEl.get(0));
        $inputEl.data("inputmask", im);
      }
    }
  }

  /**
	 *
	 */
  _focusFirstInput() {
    // focus 1st input
    $(".advice form").find("input:not(:radio),textarea,select").filter(":visible").first().focus();
  }

  /**
   *
   */
  _setAssumptionActive(isAdvice){
    const { id } = this.api.display;
    if (isAdvice) {
      $("ul li").siblings().removeClass("active");
    } else {
      $(`ul li[data-id=${id}]`).addClass("active").siblings().removeClass("active");
    }
  }

  _handleChartResize() {
    let timer;
    $(window).resize(() => {
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = setTimeout(() => {
        if (this.api.display.type == "ADVICE" &&
          this.api.display.attachment &&
          this.api.display.attachment.contentType == "application/vnd+interactive.chart+html") {
          this.updateMainPane();
        }
      }, 500);
    });
  }

  /**
	 *
	 */
  getQuerystringFromUrl(url) {
    return url.substring(url.indexOf("?") + 1);
  }
}