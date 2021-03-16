import _ from "lodash";
import pluralize from "pluralize";
import store from "store";
import Handlebars from "handlebars";
import numeral from "numeral";

export default class {
  constructor(profile, isFirstLoad = false) {
    this.profile = profile;
    console.log("goals setup for", profile)

    this.STORAGE_KEY = "frb_user_goals_" + this.profile._name;

    if (isFirstLoad) {
      this.handleClickSaveGoal();
      this.handleClickDeleteGoal();
      this.handleClickResetGoals();
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

  activateCurrentGoals() {
    if (!this.profile) { return; }
    $("body")
      .find("a.active[data-select-persona]")
      .next("span[data-profile-selected-goals]")
      .html(`&nbsp;(${pluralize("goal", this.goalCount, true)}, <a href="#" data-action="reset-goals">reset</a>)`);
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

  get costOfGoals() {
    let cost = 0;
    const goals = this.savedGoals;
    const saveForHome = goals.find(g => { return g.controllerName == "save-for-home" });
    const payoffDebt = goals.find(g => { return g.controllerName == "pay-debt" });
    const saveRetirement = goals.find(g => { return g.controllerName == "retirement" });

    if (saveForHome) {
      const { data: { variables_map } } = saveForHome;
      const { Mortgage_Down_Payment_Savings_Monthly } = variables_map;
      cost += Mortgage_Down_Payment_Savings_Monthly.value;
    }

    if (payoffDebt) {
      const { data: { variables_map } } = payoffDebt;
      const { Debt_Payment } = variables_map;
      cost += Debt_Payment.value;
    }

    if (saveRetirement) {
      const { data: { variables_map } } = saveRetirement;
      const {
        Current_Monthly_Savings = { value: 0 },
        // Monthly_401K_Contribution_Current_Total = { value: 0 },
        // Monthly_Retirement_Savings_Other_Current = { value: 0 },
      } = variables_map;

      cost += Current_Monthly_Savings.value;
      // cost += Monthly_401K_Contribution_Current_Total.value;
      // cost += Monthly_Retirement_Savings_Other_Current.value;
    }

    return cost;
  }

  renderBudgetAndGoals(){
    $("#budget_start").toggle(!this.profile.budgetcreated);
    const $container = $("#user_selected_goals");
    if ($container.length) {
      const ctx = {
        goals: this.savedGoals,
        incomeF: numeral(this.monthlyIncome).format("$0,0"),
        expensesF: numeral(this.monthlyExpenses).format("$0,0"),
        positiveAvailableCash: this.availableCash > 0,
        availableCashF: numeral(this.availableCash).format("$0,0"),
        startingCashF: numeral(this.startingCash).format("$0,0"),
        percentAllocatedF: numeral(this.percentAllocated).format("0%"),
        costOfGoalsF: numeral(this.costOfGoals).format("$0,0")
      }
      const str = Handlebars.compile($("#tmpl_user_selected_goals").html())(ctx);
      $container.html(str);

      // disable goal tiles if goal exists
      const goals = this.savedGoals;
      const saveForHome = goals.find(g => { return g.controllerName == "save-for-home" });
      const payoffDebt = goals.find(g => { return g.controllerName == "pay-debt" });
      const saveRetirement = goals.find(g => { return g.controllerName == "retirement" });

      $(".goal-tiles a").eq(0).prop("disabled", saveForHome !== undefined).toggleClass("disabled", saveForHome !== undefined);
      $(".goal-tiles a").eq(1).prop("disabled", saveRetirement !== undefined).toggleClass("disabled", saveRetirement !== undefined);
      $(".goal-tiles a").eq(2).prop("disabled", payoffDebt !== undefined).toggleClass("disabled", payoffDebt !== undefined);
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
    const data = _.pick(window.jga.api, "adviceset", "display", "params", "paramsAsQueryStr", "variables_map");
    const { display } = data;
    const { advice } = display;

    const newDisplay = display;
    delete newDisplay.advice; // delete this to avoid JSON stringify circular structure error, plus we don't need it

    data.display = [display].concat(advice);
    const newGoal = [{
      name: nameMap[controllerName],
      controllerName,
      data,
      id: _.uniqueId("goal")
    }];

    // delete current goal, if saved, and replace with new/updated
    const goalToDelete = this.savedGoals.find(g => { return g.controllerName == controllerName; });
    if (goalToDelete){
      this.deleteGoal(goalToDelete.id);
    }

    // set new goals
    this.savedGoals = this.savedGoals.concat(newGoal);

    this.emit("goals", { message: "Goal saved!" });
  }

  emit(name, detail) {
    $(document).trigger("pushnotification", [name, detail]);
  }
}
