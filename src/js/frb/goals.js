import _ from "lodash";
import pluralize from "pluralize";
import store from "store";
import Handlebars from "handlebars";
import numeral from "numeral";

export default class {
  constructor(profile, isFirstLoad = false) {
    if (!profile) {
      $("#budget_start").toggle(true);
      return;
    }
    this.profile = profile;
    console.log("goals setup for", profile)

    this.STORAGE_KEY = "frb_user_goals_" + this.profile._name;

    if (isFirstLoad) {
      this.handleClickSaveGoal();
      this.handleClickDeleteGoal();
      this.handleClickResetGoals();
      this.handleClickOptimizeGoals();
      this.activateCurrentGoals();
      this.renderBudgetAndGoals();
    } else {
      this.activateCurrentGoals();
      this.renderBudgetAndGoals();
    }
  }

  get savedGoals() {
    let g = store.get(this.STORAGE_KEY, []);
    if (g.length) {
      g = this.prioritzeGoals(g);
    }
    return g;
  }

  set savedGoals(arr) {
    store.set(this.STORAGE_KEY, arr);
    console.log("SAVING GOAL>>>>", arr);
    this.activateCurrentGoals();
  }

  get goalCount() {
    return this.savedGoals.length;
  }

  prioritzeGoals(goals) {
    const saveForHome = goals.find(g => { return g.controllerName == "save-for-home" });
    const payoffDebt = goals.find(g => { return g.controllerName == "pay-debt" });
    const saveRetirement = goals.find(g => { return g.controllerName == "retirement" });

    // debt, retirement, home
    const prioritized = [];
    if (payoffDebt) { prioritized.push(payoffDebt); }
    if (saveRetirement) { prioritized.push(saveRetirement); }
    if (saveForHome) { prioritized.push(saveForHome); }
    return prioritized;
  }

  handleClickSaveGoal() {
    $(document).on("click", "a[data-action='save-goal']", e => {
      e.preventDefault();
      const $el = $(e.currentTarget);
      $el.prop("disabled",true).addClass("disabled").text("Saved!");
      const { controller: goalName } = $el.parents("div[data-controller]").data();
      this.saveGoal(goalName);
    });
  }

  handleClickDeleteGoal() {
    $(document).on("click", "a[data-action='delete-goal']", e => {
      e.preventDefault();
      const $el = $(e.currentTarget);
      const { id } = $el.data();
      this.deleteGoal(id);
      this.emit("goals", { message: "Goal deleted!" });
      this.renderBudgetAndGoals();
    });
  }

  handleClickResetGoals() {
    $(document).on("click", "a[data-action='reset-goals']", e => {
      e.preventDefault();
      // const $el = $(e.currentTarget);
      this.resetGoals();
      this.renderBudgetAndGoals();
    });
  }

  handleClickOptimizeGoals() {
    $(document).on("click", "a[data-action='optimize-goals']", e => {
      e.preventDefault();
      this._OPTIMIZE();
    });
  }

  activateCurrentGoals() {
    if (!this.profile) { return; }
    $("body")
      .find("a.active[data-select-persona]")
      .next("span[data-profile-selected-goals]")
      .html(`&nbsp;(${pluralize("goal", this.goalCount, true)}, <a href="#" data-action="reset-goals" data-toggle="tooltip" title="Delete all goals">reset</a>)`);
  }

  _OPTIMIZE() {
    const isOverBudget = !(this.availableCash > 0);
    if (isOverBudget) {
      this.emit("opto", { message: "You're over budget" });
      const goals = this.savedGoals;
      const goalCount = goals.length;
      const saveForHome = goals.find(g => { return g.controllerName == "save-for-home" });
      // if you have a home goal, reduce this first
      if (saveForHome) {
        const cost = this.getCostFor("save-for-home");
        console.log("cost", cost)
        console.log("availableCash", this.availableCash)
        const newMonthlyCost = cost + this.availableCash;
        console.log(newMonthlyCost)
      }
    }
    this.renderBudgetAndGoals();
    this.emit("opto", { message: "Your Action Plan is optimized." });
  }

  get monthlyIncome() {
    const { Income_Monthly = 0 } = this.profile;
    return Number(Income_Monthly);
  }

  get monthlyExpenses() {
    const { Expenses_Monthly = 0 } = this.profile;
    return Number(Expenses_Monthly);
  }

  get startingCash() {
    const cash = Number(this.monthlyIncome) - Number(this.monthlyExpenses);
    return Number(cash.toFixed(2));
  }

  get availableCash() {
    const cash = this.startingCash - this.costOfGoals;
    return Number(cash.toFixed(2));
  }

  get percentAllocated() {
    const p = this.costOfGoals / this.startingCash;
    return p;
  }

  getCostFor(controllerName) {
    const goal = this.savedGoals.find(g => { return g.controllerName == controllerName });
    let cost = 0;
    if (!goal) { return cost; }

    const { data: { variables_map } } = goal;
    const {
      Current_Monthly_Savings,
      Debt_Payment,
      Mortgage_Down_Payment_Savings_Monthly
    } = variables_map;

    switch (controllerName) {
      case "pay-debt":
        cost += Debt_Payment.value;
        break;
      case "save-for-home":
        cost += Mortgage_Down_Payment_Savings_Monthly.value;
        break;
      case "retirement":
        cost += Current_Monthly_Savings.value;
        break;
    }

    return cost;
  }

  get costOfGoals() {
    let cost = 0;
    cost += this.getCostFor("pay-debt");
    cost += this.getCostFor("save-for-home");
    cost += this.getCostFor("retirement");

    // const goals = this.savedGoals;
    // const saveForHome = goals.find(g => { return g.controllerName == "save-for-home" });
    // const payoffDebt = goals.find(g => { return g.controllerName == "pay-debt" });
    // const saveRetirement = goals.find(g => { return g.controllerName == "retirement" });

    // if (saveForHome) {
    //   const { data: { variables_map } } = saveForHome;
    //   const { Mortgage_Down_Payment_Savings_Monthly } = variables_map;
    //   cost += Mortgage_Down_Payment_Savings_Monthly.value;
    // }

    // if (payoffDebt) {
    //   const { data: { variables_map } } = payoffDebt;
    //   const { Debt_Payment } = variables_map;
    //   cost += Debt_Payment.value;
    // }

    // if (saveRetirement) {
    //   const { data: { variables_map } } = saveRetirement;
    //   const {
    //     Current_Monthly_Savings = { value: 0 },
    //     // Monthly_401K_Contribution_Current_Total = { value: 0 },
    //     // Monthly_Retirement_Savings_Other_Current = { value: 0 },
    //   } = variables_map;

    //   cost += Current_Monthly_Savings.value;
    //   // cost += Monthly_401K_Contribution_Current_Total.value;
    //   // cost += Monthly_Retirement_Savings_Other_Current.value;
    // }

    return cost;
  }

  renderBudgetAndGoals(){
    const showBudget = (this.profile && this.profile.budgetcreated);
    $("#budget_start").toggle(!showBudget);
    const $container = $("#user_selected_goals");
    if ($container.length) {
      const goals = this.savedGoals;
      // remove 1st advice from
      const ctx = {
        goals,
        incomeF: numeral(this.monthlyIncome).format("$0,0"),
        expensesF: numeral(this.monthlyExpenses).format("$0,0"),
        positiveAvailableCash: this.availableCash > 0,
        availableCashF: numeral(this.availableCash).format("$0,0"),
        startingCashF: numeral(this.startingCash).format("$0,0"),
        percentAllocatedF: numeral(this.percentAllocated).format("0%"),
        costOfGoalsF: numeral(this.costOfGoals).format("$0,0"),
        showOptimizeButton: goals.length > 1
      }
      console.log("goals ctx", ctx)
      const str = Handlebars.compile($("#tmpl_user_selected_goals").html())(ctx);
      $container.html(str);

      // disable goal tiles if goal exists
      const saveForHome = goals.find(g => { return g.controllerName == "save-for-home" });
      const payoffDebt = goals.find(g => { return g.controllerName == "pay-debt" });
      const saveRetirement = goals.find(g => { return g.controllerName == "retirement" });
      const $tiles = $(".goal-tiles a");
      $tiles.eq(0).prop("disabled", saveForHome !== undefined).toggleClass("disabled", saveForHome !== undefined);
      $tiles.eq(1).prop("disabled", saveRetirement !== undefined).toggleClass("disabled", saveRetirement !== undefined);
      $tiles.eq(2).prop("disabled", payoffDebt !== undefined).toggleClass("disabled", payoffDebt !== undefined);
    }
  }

  resetGoals() {
    this.savedGoals = [];
  }

  deleteGoal(id) {
    const newGoals = this.savedGoals.filter(g => { return g.id != id });
    this.savedGoals = newGoals;
  }

  saveGoal(controllerName) {
    const nameMap = {
      "save-for-home": "Save for a home",
      "retirement": "Save for retirement",
      "pay-debt": "Payoff debt",
    }
    const data = _.pick(window.jga.api, "adviceset", "params", "paramsAsQueryStr", "variables_map", "save_to_goal");
    const { save_to_goal } = data;
    const { advice } = save_to_goal;
    const [headline] = advice;

    // remove headline item from data.display[] so we don't dupe
    const filteredAdvice = advice.filter(a => { return a.id != headline.id });

    data.display = filteredAdvice;
    const newGoal = [{
      name: nameMap[controllerName],
      controllerName,
      data,
      headline,
      id: _.uniqueId(`${controllerName}_`)
    }];

    // delete current goal, if saved, and replace with new/updated
    const goalToDelete = this.savedGoals.find(g => { return g.controllerName == controllerName; });
    if (goalToDelete){
      this.deleteGoal(goalToDelete.id);
    }

    // set new goals
    console.log("about to save this goal data", this.savedGoals.concat(newGoal))
    this.savedGoals = this.savedGoals.concat(newGoal);

    this.emit("goals", { message: "Goal saved! Action Plan updated." });
  }

  emit(name, detail) {
    $(document).trigger("pushnotification", [name, detail]);
  }
}
