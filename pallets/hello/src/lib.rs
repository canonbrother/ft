#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod tests;

// Configuration Trait
// The configuration trait is used to access features from other pallets,
// or constant that affect the pallet's behaviour.
// Configuration trait can remain empty, although it must still exists.
// pub trait Config: frame_system::Config {}

// // Dispatchable Calls
// // allow to call as part of Extrinsic.
// // "Extrinsic" is substrate jargon meaning a call from outside of the chain, eg: Ethereum transaction
// // its defined in the `decl_module!` macro.
// decl_module! {
// 	pub struct Module<T: Config> for enum Call where origin: T::Origin {

// 		// Weights affect the fees a user will have to pay to call the function
// 		// default weight to call
// 		#[weight = 10_000]
// 		pub fn say_hello(origin) -> DispatchResult {
// 			// Ensure that the caller is a regular keypair account
// 			let caller = ensure_signed(origin)?;
			
// 			print("Hello Substrate");
// 			// Inspecting variables
// 			debug::info("Request sent by: {:?}", caller);
// 			// debug::debug!(target: "mytarget", "called by {:?}", caller);

// 			// Indicate that this call succeeded
// 			Ok(())
// 		}
// 	}
// }

#[frame_support::pallet]
pub mod pallet {
	use core::marker::PhantomData;

	use frame_support::{dispatch::DispatchResultWithPostInfo, pallet_prelude::*};
	use frame_system::{ensure_signed, pallet_prelude::*};
	use sp_runtime::print;
	
	#[pallet::config]
	pub trait Config: frame_system::Config {}
	
	#[pallet::pallet]
	#[pallet::generate_store(pub(super) trait Store)]
	pub struct Pallet<T>(PhantomData<T>);
	
	#[pallet::hooks]
	impl<T: Config> Hooks<BlockNumberFor<T>> for Pallet<T> {}
	
	#[pallet::call]
	impl<T: Config> Pallet<T> {
		// Increase the value associated with a particular key
		#[pallet::weight(10_000)]
		pub fn say_hello(origin: OriginFor<T>) -> DispatchResultWithPostInfo {
			// Ensure the caller is a regular keypair account
			let caller = ensure_signed(origin)?;
			println!("caller: {:?}", caller);
			
			print("Hello Substrate");
			// debug::info!("Reuqest sent by: {:?}", caller);
			
			// Indicate this call succeeded
			Ok(().into())
		}
	}
}
