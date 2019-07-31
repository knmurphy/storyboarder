const THREE = require('three');
const GPUPickerHelper = require("./GPUPickerHelper");
require("../IK/utils/Object3dExtension");
class GPUPicker
{
    constructor()
    {
        this.pickingScene = new THREE.Scene();
        this.pickingPosition = new THREE.Vector2();
        this.gpuPickerHelper = new GPUPickerHelper();
        this.pickingScene.background = new THREE.Color(0);
        this.isInitialized = false;
        this.childrenSetted = false;
        this.idBonus = 3000;
    }

    initialize(scene, renderer)
    {
        if(this.isInitialized )
        {
            return;
        }
        this.pickingScene.background = new THREE.Color(0);
        this.children = scene.children;
        this.renderer = renderer;
        this.isInitialized = true;
    }

    initalizeChildren(scene)
    {
        let objects = [];
        this.getAllSceneMeshes(scene, objects);

        for(let i = 0, n = objects.length; i < n; i++)
        {
            let object = objects[i];
            if(this.isObjectAdded(object))
            {
                continue;
            }
            const id = i + this.idBonus;
            object.parent.updateMatrixWorld(true);
            this.gpuPickerHelper.selectableObjects[id] = object;
            const pickingMaterial = new THREE.MeshToonMaterial({
                emissive: new THREE.Color(id),
                color: new THREE.Color(0, 0, 0),
                specular: new THREE.Color(0, 0, 0),
                transparent: true,
                side: THREE.DoubleSide,
                alphaTest: 0.5,
                blending: THREE.NoBlending,
                
              });
            let pickingCube = null;
            if(object.type === "SkinnedMesh")
            {
                //let userData = object.userData;
                //object.userData = [];
                //pickingCube = THREE.SkeletonUtils.clone(object);//new THREE.SkinnedMesh(object.geometry.clone(), pickingMaterial);
                //object.userData = userData;
                //pickingCube.material = pickingMaterial;
                ////let skeleton = new THREE.Skeleton( object.skeleton.bones );
                ////pickingCube.bindMode = "detached";
                ////object.bindMode = "detached";
                ////object.bind(object.skeleton);
                ////let rootBone = pickingCube.skeleton.bones[ 0 ];
                ////pickingCube.add( rootBone );
                ////pickingCube.bind( pickingCube.skeleton);
                ////pickingCube.skeleton.bones = object.skeleton.bones;
                ////console.log(object);
                ////console.log(pickingCube);
                //console.log(pickingCube);
                //console.log(object);
            }
            else
            {
            }
            pickingCube = new THREE.Mesh(object.geometry, pickingMaterial);
            this.pickingScene.add(pickingCube);
            pickingCube.position.copy(object.worldPosition());
            pickingCube.quaternion.copy(object.worldQuaternion());
            pickingCube.scale.copy(object.worldScale());
            pickingCube.updateMatrix();
            object.updateMatrixWorld(true);
        }
        this.childrenSetted = this.pickingScene.children.length === 0 ? false : true;
    }

    setPickingPosition(vector2)
    {
        this.pickingPosition.copy(vector2);
    }

    setPickingPosition(x, y)
    {
        this.pickingPosition.x = x;
        this.pickingPosition.y = y;
    }

    pick(camera)
    {
        this.gpuPickerHelper.pick(this.pickingPosition, this.pickingScene, camera, this.renderer);
    }

    updateObject()
    {
        for(let i = 0, n = this.pickingScene.children.length; i < n; i++)
        {
            let child = this.pickingScene.children[i];
            let object = this.gpuPickerHelper.selectableObjects[i + this.idBonus];
            child.position.copy(object.worldPosition());
            child.quaternion.copy(object.worldQuaternion());
            child.scale.copy(object.worldScale());
            child.updateMatrix();
            child.updateMatrixWorld(true);
            if(child.type === "SkinnedMesh")
            {
                let originalRootBone = object.skeleton.bones[0];
                let clonnedRootBone = child.skeleton.bones[0];
                //this.updateSkeletonBone(clonnedRootBone, originalRootBone);
                clonnedRootBone.updateMatrixWorld(true);
            }
        }
    }

    updateSkeletonBone(cloneBone, originalBone)
    {
        cloneBone.position.copy(originalBone.position);
        cloneBone.quaternion.copy(originalBone.quaternion);
        cloneBone.scale.copy(originalBone.scale);
        for(let i = 0, n = originalBone.children.length; i < n; i++)
        {   
            this.updateSkeletonBone(cloneBone.children[i], originalBone.children[i]);
        }
    }

    isObjectAdded(object)
    {
        if(Object.values(this.gpuPickerHelper.selectableObjects).filter(obj => obj.uuid === object.uuid).length !== 0)
        {
            return true;
        }
        return false;
    }

    getAllSceneMeshes(sceneMesh, meshes)
    {
        let sceneChildren = sceneMesh.children;
        if(sceneChildren === undefined)
        {
            return;
        }
        if(sceneMesh.userData && (sceneMesh.userData.type === "object" || sceneMesh.userData.type === "character" ))
        {
            for(let i = 0, n = sceneChildren.length; i < n; i++)
            {
                let child = sceneChildren[i];
                if(child.type === "Mesh") 
                {
                    meshes.push(child); 
                    return;
                }
                if(child.children.length !== 0 && child.children[0].type === "LOD")
                {
                    meshes.push(child.children[0].children[0]);
                    return;
                }
                if( child.type === "SkinnedMesh")
                {
                    meshes.push(child);
                    return;
                }
            }
        }
        for(let i = 0, n = sceneChildren.length; i < n; i++)
        {
            this.getAllSceneMeshes(sceneChildren[i], meshes);
        }
    }
}
module.exports = GPUPicker;
