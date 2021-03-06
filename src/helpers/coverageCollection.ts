import { ICoverageFragment, ICoverageFragmentBase, ICoverageCollectionStat } from './../types';
import { CoverageColor, ICoverageCollection } from '../types';


// type Fragment = typeof CoverageFlatFragment | typeof CoverageFragment


export class CoverageCollection implements ICoverageCollection {
    private _maxColumn: number|undefined;
    private _items: Set<ICoverageFragment> = new Set();
    private _stat: ICoverageCollectionStat|undefined;
    private _frozen: boolean;

    public addItem(fragment: ICoverageFragment): void {
        this._checkFrozen();
        this._addItem(fragment);
    }

    public removeItem(fragment: ICoverageFragment) {
        this._checkFrozen();
        this._removeItem(fragment);
    }

    public merge(collection: ICoverageCollection): ICoverageCollection {
        this._checkFrozen();
        return this._merge(collection);
    }

    public dump(): ICoverageFragmentBase[] {
        return Array.from(this._items).map((o) => o.dump());
    }

    public get items(): Set<ICoverageFragment> {
        return this._items;
    }

    public normalize() {
        this._stat = undefined;
        this._freeze();
        this._normalize();
        this._unfreeze();
    }
    
    public get stat() {
        if (this._stat !== undefined) {
            return this._stat
        }

        const f = Array.from(this._items);
        this._stat = {
            covered: f.filter((b) => b.color === CoverageColor.GREEN).length,
            uncovered: f.filter((b) => b.color > CoverageColor.GREEN).length,
            total: f.length
        }
        return this._stat;
    }

    public get maxColumns(): number {
        if (!this._frozen) {
            throw new Error('You must freeze() collection before')
        }
        if (this._maxColumn === undefined) {
            this._maxColumn = Array.from(this._items).reduce((prev, b) => {
                const endCol = b.end.column || 0
                if (endCol > prev) {
                    return endCol;
                }
                const startCol = b.start.column || 0
                if (startCol > prev) {
                    return startCol;
                }
                return prev;
            }, 0);
        }
        return this._maxColumn;
    }

    private _freeze() {
        this._checkFrozen();
        this._frozen = true;
    }
    
    private _unfreeze() {
        this._frozen = false;
    }

    private _checkFrozen() {
        if (this._frozen) {
            throw new Error('This collection has been frozen')
        }
    }

    private _addItem(fragment: ICoverageFragment): void {
        this._stat = undefined;
        if (fragment.collection !== undefined && fragment.collection !== this) {
            throw new Error('This item has already in collection')
        }
        fragment.collection = this;
        this._items.add(fragment);
    }

    private _removeItem(fragment: ICoverageFragment) {
        this._stat = undefined;
        this._items.delete(fragment);
    }

    private _merge(collection: ICoverageCollection): ICoverageCollection {
        this._stat = undefined;
        for (let b of collection.items) {
            this._addItem(b.clone())
        }
        return this;
    }

    private _normalize() {
        while(-1) {
            const collisionPair = this._hasCollision();
            if (collisionPair === undefined) {
                break;
            }
            this._fixCollision(collisionPair)
        }
    }

    private _fixCollision(collisionPair: [ICoverageFragment, ICoverageFragment]) {
        // Not neccesary which fragment is new. But old must be < than new
        let [oldFragment, newFragment] = collisionPair;
        if (oldFragment.length < newFragment.length) {
            [newFragment, oldFragment] = [oldFragment, newFragment];
        }

        if (newFragment.length <= 0) {
            this._removeItem(newFragment);
            return
        }
        if (oldFragment.length <= 0) {
            this._removeItem(oldFragment);
            return
        }

        if (oldFragment.color === newFragment.color) {
            // union fragments. Update new fragment and remove old fragment
            newFragment.flatStart = Math.min(newFragment.flatStart, oldFragment.flatStart)
            newFragment.flatEnd = Math.max(newFragment.flatEnd, oldFragment.flatEnd)
            newFragment.addNoteFrom(oldFragment);
            this._removeItem(oldFragment);
        } else if (oldFragment.color > newFragment.color) {
            // keep old fragment and use part of new fragment if nessesary
            if (newFragment.flatStart > oldFragment.flatStart) {
                newFragment.flatStart = oldFragment.flatEnd + 1
            } else if (newFragment.flatEnd > oldFragment.flatStart) {
                newFragment.flatEnd = oldFragment.flatStart - 1
            } else {
                // Similar lines in line mode 
                this._removeItem(newFragment);
                oldFragment.addNoteFrom(newFragment);
                return
            }
            if (newFragment.length <= 0) {
                oldFragment.addNoteFrom(newFragment);
                this._removeItem(newFragment)
            }
        } else {
            // keep new fragment and use part of old fragment if nessesary
            this._removeItem(oldFragment);
            let notesWereKeep = false;
            if (oldFragment.flatStart < newFragment.flatStart) {
                const newOne1 = oldFragment.clone();
                newOne1.collection = this;
                newOne1.flatEnd = newFragment.flatStart - 1
                if (newOne1.length > 0) {
                    this._addItem(newOne1);
                    notesWereKeep = true;
                }
            } 
            if (oldFragment.flatEnd > newFragment.flatEnd) {
                const newOne2 = oldFragment.clone();
                newOne2.collection = this;
                newOne2.flatStart = newFragment.flatEnd + 1
                if (newOne2.length > 0) {
                    this._addItem(newOne2);
                    notesWereKeep = true;
                }
            }
            if (!notesWereKeep) {
                newFragment.addNoteFrom(oldFragment);
            }
        }
    }

    private _hasCollision(): [ICoverageFragment, ICoverageFragment]|undefined {
        const items = Array.from(this._items);

        // From down to up
        for (let i = items.length - 1; i >= 0; --i) {
            const newItem = items[i];
            
            for(let k = items.length - 1; k >=0; --k) {
                const oldItem = items[k];
                if (oldItem === newItem) {
                    continue
                }

                if (newItem.isCollisionWith(oldItem)) {
                    return [oldItem, newItem]
                }
            }
        }
    }
}
