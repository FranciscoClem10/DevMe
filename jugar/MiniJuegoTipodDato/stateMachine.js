class StateMachine {
    constructor(owner) {
        this.owner = owner;
        this.currentState = null;
        this.states = new Map();
    }

    addState(name, stateConfig) {
        this.states.set(name, stateConfig);
    }

    changeState(name) {
        if (!this.states.has(name)) return;
        if (this.currentState && this.states.get(this.currentState).exit) {
            this.states.get(this.currentState).exit(this.owner);
        }
        this.currentState = name;
        if (this.states.get(this.currentState).enter) {
            this.states.get(this.currentState).enter(this.owner);
        }
    }

    update(dt) {
        if (this.currentState && this.states.get(this.currentState).update) {
            this.states.get(this.currentState).update(this.owner, dt);
        }
    }

    getCurrent() { return this.currentState; }
}
