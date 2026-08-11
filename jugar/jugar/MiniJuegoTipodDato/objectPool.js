class ObjectPool {
    constructor(createFn, size = 150) {
        this.pool = [];
        this.createFn = createFn;
        for (let i = 0; i < size; i++) {
            this.pool.push(this.createFn());
        }
    }

    get() {
        let obj = this.pool.find(o => !o.active);
        if (!obj) {
            obj = this.createFn();
            this.pool.push(obj);
        }
        obj.active = true;
        return obj;
    }

    release(obj) {
        obj.active = false;
    }
}
